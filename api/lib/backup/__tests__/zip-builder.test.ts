/**
 * zip-builder 测试：覆盖核心契约
 *   1. 跨表一致性快照通过 RPC 一次性拿到（不会自己重新拼）
 *   2. edition_files 重写：image 类型 → ZIP 内相对路径 + _original_url 保留；非 image → file_url 原样
 *   3. 图片下载失败 → 单条行回退保留原 file_url（不影响整体 ZIP 生成）
 *   4. manifest.stats 与 data 行数一致
 *   5. manifest.total_size_bytes = 实际 buffer.byteLength
 *   6. RPC error / 空 payload → 抛错
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBackupZip, resolveToAbsoluteUrl } from '../zip-builder';

// ====================================================
// Mock 状态：每个测试在 beforeEach 里重置
// ====================================================
interface RpcResponse {
  data: unknown;
  error: { message: string } | null;
}

let rpcResponse: RpcResponse;
const rpcSpy = vi.fn(async () => rpcResponse);

function makeMockSupabase(): SupabaseClient {
  return {
    rpc: rpcSpy,
  } as unknown as SupabaseClient;
}

// ====================================================
// Mock global fetch（图片下载）
// ====================================================
const originalFetch = global.fetch;
type FetchImpl = (url: string) => Promise<Response>;
let fetchImpl: FetchImpl;

// 保证 resolveToAbsoluteUrl 有可用的 SUPABASE_URL（不依赖 .env.local）
const ORIGINAL_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const TEST_SUPABASE_URL = 'https://test.supabase.co';

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = TEST_SUPABASE_URL;
  rpcResponse = { data: null, error: null };
  rpcSpy.mockClear();
  // 默认所有 fetch 都给 200 + 1KB jpeg buffer
  fetchImpl = async () => {
    const body = new Uint8Array(1024).fill(0xff);
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  };
  global.fetch = ((url: string) => fetchImpl(url)) as typeof global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (ORIGINAL_SUPABASE_URL === undefined) {
    delete process.env.VITE_SUPABASE_URL;
  } else {
    process.env.VITE_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  }
});

// ====================================================
// 工具：从 buffer 反查 ZIP 内文件清单 + manifest
// ====================================================
async function unpackZip(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const filenames = Object.keys(zip.files);
  const manifestStr = await zip.files['manifest.json'].async('string');
  const dataStr = await zip.files['data.json'].async('string');
  return {
    filenames,
    manifest: JSON.parse(manifestStr) as Record<string, unknown>,
    data: JSON.parse(dataStr) as Record<string, unknown>,
  };
}

// ====================================================
// Fixture：常用的 snapshot 形状
// ====================================================
function emptySnapshot() {
  return {
    artworks: [],
    editions: [],
    edition_files: [],
    edition_history: [],
    locations: [],
    gallery_links: [],
    api_keys: [],
  };
}

// ====================================================
// 测试
// ====================================================
describe('buildBackupZip — 基础契约', () => {
  it('空数据库：所有表 0 行，ZIP 仍可正常生成', async () => {
    rpcResponse = { data: emptySnapshot(), error: null };
    const { buffer, manifest } = await buildBackupZip(
      'user-1',
      'a@b.com',
      makeMockSupabase(),
    );

    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(manifest.stats).toEqual({
      artworks: 0,
      editions: 0,
      edition_files: 0,
      edition_history: 0,
      locations: 0,
      gallery_links: 0,
      api_keys: 0,
    });
    expect(manifest.image_count).toBe(0);
    expect(manifest.user_id).toBe('user-1');
    expect(manifest.user_email).toBe('a@b.com');
  });

  it('manifest 带 schema/format 版本 + 时间戳', async () => {
    rpcResponse = { data: emptySnapshot(), error: null };
    const { manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    expect(manifest.backup_format_version).toBeTypeOf('number');
    expect(manifest.db_schema_version).toBeTypeOf('string');
    expect(manifest.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('调用 RPC backup_snapshot 时带正确的 userId 参数', async () => {
    rpcResponse = { data: emptySnapshot(), error: null };
    await buildBackupZip('user-xyz', 'x@y.com', makeMockSupabase());
    expect(rpcSpy).toHaveBeenCalledWith('backup_snapshot', { p_user_id: 'user-xyz' });
  });

  it('manifest.total_size_bytes 与实际 buffer.byteLength 一致', async () => {
    rpcResponse = { data: emptySnapshot(), error: null };
    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    expect(manifest.total_size_bytes).toBe(buffer.byteLength);
  });
});

describe('buildBackupZip — 图片打包语义', () => {
  it('image 类型文件：下载成功 → ZIP 内相对路径 + _original_url 保留原始 URL', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'file-aaa',
            edition_id: 'ed-1',
            source_type: 'manual',
            file_url: 'https://thumbnails.example.com/img1.jpg',
            file_type: 'image',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(filenames).toContain('images/file-aaa.jpg');
    expect(manifest.image_count).toBe(1);
    expect((data.edition_files as Array<Record<string, unknown>>)[0]).toMatchObject({
      file_url: 'images/file-aaa.jpg',
      _original_url: 'https://thumbnails.example.com/img1.jpg',
    });
  });

  it('非 image 类型文件（pdf）：file_url 原样保留，不进 ZIP', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'file-pdf',
            edition_id: 'ed-1',
            source_type: 'manual',
            file_url: 'https://docs.example.com/doc.pdf',
            file_type: 'pdf',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    // 没有 images/file-pdf.* 进 ZIP
    expect(filenames.some((n) => n.startsWith('images/file-pdf'))).toBe(false);
    expect(manifest.image_count).toBe(0);
    // file_url 原样保留
    expect((data.edition_files as Array<Record<string, unknown>>)[0].file_url).toBe(
      'https://docs.example.com/doc.pdf',
    );
    expect((data.edition_files as Array<Record<string, unknown>>)[0]._original_url).toBeUndefined();
  });

  it('image 下载失败 → 单条行回退保留原 file_url，不破坏 ZIP', async () => {
    fetchImpl = async () => new Response(null, { status: 404 });

    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'file-broken',
            edition_id: 'ed-1',
            source_type: 'manual',
            file_url: 'https://broken.example.com/missing.jpg',
            file_type: 'image',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(filenames.some((n) => n.startsWith('images/file-broken'))).toBe(false);
    expect(manifest.image_count).toBe(0);
    expect((data.edition_files as Array<Record<string, unknown>>)[0].file_url).toBe(
      'https://broken.example.com/missing.jpg',
    );
  });

  it('混合 image / 非 image / 失败：每条按各自语义处理', async () => {
    // 1 张 image 成功 + 1 张 image 失败 + 1 个非 image
    let callCount = 0;
    fetchImpl = async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(new Uint8Array(512), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      return new Response(null, { status: 500 });
    };

    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'img-ok',
            edition_id: 'ed-1',
            source_type: 'manual',
            file_url: 'https://x.com/ok.png',
            file_type: 'image',
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'img-fail',
            edition_id: 'ed-1',
            source_type: 'manual',
            file_url: 'https://x.com/fail.png',
            file_type: 'image',
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'doc',
            edition_id: 'ed-1',
            source_type: 'manual',
            file_url: 'https://x.com/sheet.csv',
            file_type: 'csv',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);
    const files = data.edition_files as Array<Record<string, unknown>>;

    expect(manifest.image_count).toBe(1);
    expect(manifest.stats).toMatchObject({ edition_files: 3 });
    expect(filenames.some((n) => n === 'images/img-ok.png')).toBe(true);
    expect(filenames.some((n) => n.startsWith('images/img-fail'))).toBe(false);
    expect(filenames.some((n) => n.startsWith('images/doc'))).toBe(false);

    expect(files[0]).toMatchObject({ file_url: 'images/img-ok.png', _original_url: 'https://x.com/ok.png' });
    expect(files[1].file_url).toBe('https://x.com/fail.png');
    expect(files[2].file_url).toBe('https://x.com/sheet.csv');
  });

  it('重复的 image URL 只下载一次（去重）', async () => {
    let fetchCalls = 0;
    fetchImpl = async () => {
      fetchCalls += 1;
      return new Response(new Uint8Array(256), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    };

    const sharedUrl = 'https://x.com/shared.jpg';
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'f1',
            edition_id: 'ed-1',
            source_type: 'manual',
            file_url: sharedUrl,
            file_type: 'image',
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'f2',
            edition_id: 'ed-2',
            source_type: 'manual',
            file_url: sharedUrl,
            file_type: 'image',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };

    const { manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    expect(fetchCalls).toBe(1);
    expect(manifest.image_count).toBe(2); // 两个 row 都打包，但只下载 1 次
  });
});

describe('buildBackupZip — 错误路径', () => {
  it('RPC 返回 error → 抛错带 message', async () => {
    rpcResponse = { data: null, error: { message: 'rpc denied' } };
    await expect(buildBackupZip('u', 'e', makeMockSupabase())).rejects.toThrow(/rpc denied/);
  });

  it('RPC 返回 null payload → 抛错', async () => {
    rpcResponse = { data: null, error: null };
    await expect(buildBackupZip('u', 'e', makeMockSupabase())).rejects.toThrow(/empty payload/);
  });
});

describe('resolveToAbsoluteUrl — URL 形态归一', () => {
  it('绝对 https URL 原样返回', () => {
    const u = 'https://x.supabase.co/storage/v1/object/public/thumbnails/a/b.png';
    expect(resolveToAbsoluteUrl(u)).toBe(u);
  });

  it('绝对 http URL 也原样返回', () => {
    const u = 'http://example.com/x.jpg';
    expect(resolveToAbsoluteUrl(u)).toBe(u);
  });

  it('相对路径拼到 thumbnails bucket public URL', () => {
    const path = 'edition-uuid/file-uuid_name.png';
    expect(resolveToAbsoluteUrl(path)).toBe(
      `${TEST_SUPABASE_URL}/storage/v1/object/public/thumbnails/${path}`,
    );
  });

  it('相对路径前的多余斜杠被裁掉', () => {
    expect(resolveToAbsoluteUrl('/a/b.png')).toBe(
      `${TEST_SUPABASE_URL}/storage/v1/object/public/thumbnails/a/b.png`,
    );
  });

  it('空字符串返回空字符串（不抛）', () => {
    expect(resolveToAbsoluteUrl('')).toBe('');
  });
});

describe('buildBackupZip — artworks.thumbnail_url 打包', () => {
  it('thumbnail_url 绝对 URL：下载成功 → ZIP 内相对路径 + _original_thumbnail_url 保留', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        artworks: [
          {
            id: 'aw-001',
            thumbnail_url: 'https://x.supabase.co/storage/v1/object/public/thumbnails/x/y.jpg',
          },
        ],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(filenames).toContain('images/aw-001.jpg');
    expect(manifest.image_count).toBe(1);
    expect((data.artworks as Array<Record<string, unknown>>)[0]).toMatchObject({
      thumbnail_url: 'images/aw-001.jpg',
      _original_thumbnail_url: 'https://x.supabase.co/storage/v1/object/public/thumbnails/x/y.jpg',
    });
  });

  it('thumbnail_url 相对路径：解析后下载并打包，_original_thumbnail_url 保留原始相对路径', async () => {
    const relPath = 'edition-uuid/file-uuid_image.png';
    const fetchedUrls: string[] = [];
    fetchImpl = async (url) => {
      fetchedUrls.push(url);
      return new Response(new Uint8Array(256), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    };

    rpcResponse = {
      data: {
        ...emptySnapshot(),
        artworks: [{ id: 'aw-rel', thumbnail_url: relPath }],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(fetchedUrls).toContain(
      `${TEST_SUPABASE_URL}/storage/v1/object/public/thumbnails/${relPath}`,
    );
    expect(filenames).toContain('images/aw-rel.png');
    expect(manifest.image_count).toBe(1);
    expect((data.artworks as Array<Record<string, unknown>>)[0]).toMatchObject({
      thumbnail_url: 'images/aw-rel.png',
      _original_thumbnail_url: relPath, // 保留原始字段（相对路径）
    });
  });

  it('thumbnail_url 下载失败 → 字段保留原值，不破坏 ZIP', async () => {
    fetchImpl = async () => new Response(null, { status: 404 });

    rpcResponse = {
      data: {
        ...emptySnapshot(),
        artworks: [{ id: 'aw-broken', thumbnail_url: 'https://broken.example.com/x.jpg' }],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(filenames.some((n) => n.startsWith('images/aw-broken'))).toBe(false);
    expect(manifest.image_count).toBe(0);
    expect((data.artworks as Array<Record<string, unknown>>)[0].thumbnail_url).toBe(
      'https://broken.example.com/x.jpg',
    );
    expect(
      (data.artworks as Array<Record<string, unknown>>)[0]._original_thumbnail_url,
    ).toBeUndefined();
  });

  it('artworks 与 edition_files 同 ZIP 共存 + UUID 命名空间不冲突', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        artworks: [{ id: 'aw-A', thumbnail_url: 'https://x.com/a.jpg' }],
        edition_files: [
          {
            id: 'ef-B',
            edition_id: 'ed-1',
            source_type: 'manual',
            file_url: 'https://x.com/b.png',
            file_type: 'image',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };

    fetchImpl = async (url) => {
      const ctype = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return new Response(new Uint8Array(128), {
        status: 200,
        headers: { 'content-type': ctype },
      });
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames } = await unpackZip(buffer);

    expect(filenames).toContain('images/aw-A.jpg');
    expect(filenames).toContain('images/ef-B.png');
    expect(manifest.image_count).toBe(2);
  });
});

describe('buildBackupZip — edition_files.file_url 相对路径解析', () => {
  it('相对路径的 file_url：拼上 Storage public URL prefix 后 fetch', async () => {
    const relPath = '714471ea/file-uuid_image.png';
    const fetchedUrls: string[] = [];
    fetchImpl = async (url) => {
      fetchedUrls.push(url);
      return new Response(new Uint8Array(256), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    };

    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'file-rel',
            edition_id: 'ed-1',
            source_type: 'upload',
            file_url: relPath,
            file_type: 'image',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(fetchedUrls).toContain(
      `${TEST_SUPABASE_URL}/storage/v1/object/public/thumbnails/${relPath}`,
    );
    expect(filenames).toContain('images/file-rel.png');
    expect(manifest.image_count).toBe(1);
    expect((data.edition_files as Array<Record<string, unknown>>)[0]).toMatchObject({
      file_url: 'images/file-rel.png',
      _original_url: relPath, // 保留原始相对路径
    });
  });
});

describe('buildBackupZip — manifest 与 stats 一致', () => {
  it('stats 各字段等于对应数组长度', async () => {
    rpcResponse = {
      data: {
        artworks: [{ id: 'a1' }, { id: 'a2' }],
        editions: [{ id: 'e1' }],
        edition_files: [],
        edition_history: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
        locations: [{ id: 'l1' }],
        gallery_links: [],
        api_keys: [{ id: 'k1' }],
      },
      error: null,
    };

    const { manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    expect(manifest.stats).toEqual({
      artworks: 2,
      editions: 1,
      edition_files: 0,
      edition_history: 3,
      locations: 1,
      gallery_links: 0,
      api_keys: 1,
    });
  });
});
