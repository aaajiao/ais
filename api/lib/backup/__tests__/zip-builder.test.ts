/**
 * zip-builder 测试：覆盖核心契约
 *   1. RPC 一致性快照入口（不会自己重新拼）
 *   2. Storage 下载走 supabase.storage.from(bucket).download(path) —— 穿 private bucket
 *   3. ZIP 双子目录：artworks/{id}.{ext} + files/{id}.{ext}
 *   4. edition_files 扫 source_type='upload'（image / pdf / doc 全部备份）；
 *      'link' 类跳过
 *   5. parseStorageRef 解析两种形态（绝对 supabase URL / 相对路径）
 *   6. manifest.stats 与 data 行数一致 + total_size_bytes = buffer.byteLength
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBackupZip, parseStorageRef } from '../zip-builder';

// ====================================================
// Mock state
// ====================================================
interface RpcResponse {
  data: unknown;
  error: { message: string } | null;
}

interface DownloadResponse {
  data: Blob | null;
  error: { message: string } | null;
}

let rpcResponse: RpcResponse;
let downloadImpl: (bucket: string, path: string) => Promise<DownloadResponse>;
let downloadCalls: Array<{ bucket: string; path: string }>;

const rpcSpy = vi.fn(async () => rpcResponse);

function makeMockSupabase(): SupabaseClient {
  return {
    rpc: rpcSpy,
    storage: {
      from: (bucket: string) => ({
        download: (path: string) => {
          downloadCalls.push({ bucket, path });
          return downloadImpl(bucket, path);
        },
      }),
    },
  } as unknown as SupabaseClient;
}

function makeBlobResponse(
  contentType = 'image/jpeg',
  bytes = new Uint8Array(1024).fill(0xff),
): DownloadResponse {
  return {
    data: new Blob([bytes], { type: contentType }),
    error: null,
  };
}

beforeEach(() => {
  rpcResponse = { data: null, error: null };
  rpcSpy.mockClear();
  downloadCalls = [];
  // 默认所有 download() 都给 1KB jpeg blob
  downloadImpl = async () => makeBlobResponse();
});

// ====================================================
// Helpers
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
// parseStorageRef 单元测试
// ====================================================
describe('parseStorageRef — URL / 相对路径解析', () => {
  it('绝对 supabase Storage URL (/public/) → 提取 bucket + path', () => {
    const u = 'https://kbwoi.supabase.co/storage/v1/object/public/thumbnails/edition-id/x.jpg';
    expect(parseStorageRef(u, 'thumbnails')).toEqual({
      bucket: 'thumbnails',
      path: 'edition-id/x.jpg',
    });
  });

  it('绝对 supabase Storage URL (/sign/) → 提取 bucket + path', () => {
    const u = 'https://x.supabase.co/storage/v1/object/sign/edition-files/abc/y.pdf?token=...';
    const ref = parseStorageRef(u, 'edition-files');
    expect(ref?.bucket).toBe('edition-files');
    // path 含 ?token=... query —— URL pathname 不带 query，所以 path 不应有 ?
    expect(ref?.path).toBe('abc/y.pdf');
  });

  it('非 storage 路径的绝对 URL → 返 null（外链不下载）', () => {
    expect(parseStorageRef('https://example.com/img.jpg', 'thumbnails')).toBeNull();
    expect(parseStorageRef('https://public.3.basecamp.com/p/QeN', 'edition-files')).toBeNull();
  });

  it('相对路径 → 用 defaultBucket', () => {
    expect(parseStorageRef('edition-uuid/file.png', 'edition-files')).toEqual({
      bucket: 'edition-files',
      path: 'edition-uuid/file.png',
    });
    expect(parseStorageRef('artwork-uuid/cover.jpg', 'thumbnails')).toEqual({
      bucket: 'thumbnails',
      path: 'artwork-uuid/cover.jpg',
    });
  });

  it('相对路径前的多余斜杠被裁掉', () => {
    expect(parseStorageRef('/a/b.png', 'thumbnails')).toEqual({
      bucket: 'thumbnails',
      path: 'a/b.png',
    });
  });

  it('空字符串 → null', () => {
    expect(parseStorageRef('', 'thumbnails')).toBeNull();
  });
});

// ====================================================
// 基础契约
// ====================================================
describe('buildBackupZip — 基础契约', () => {
  it('空数据库：所有表 0 行，ZIP 仍可正常生成', async () => {
    rpcResponse = { data: emptySnapshot(), error: null };
    const { buffer, manifest } = await buildBackupZip('user-1', 'a@b.com', makeMockSupabase());

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
    expect(downloadCalls).toEqual([]); // 没行 → 没下载
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

// ====================================================
// artworks.thumbnail_url
// ====================================================
describe('buildBackupZip — artworks/{id}.{ext} 打包', () => {
  it('绝对 thumbnails URL：解析 bucket+path → storage.download → 写 artworks/{id}', async () => {
    const thumbUrl = 'https://x.supabase.co/storage/v1/object/public/thumbnails/aw-001/cover.jpg';
    rpcResponse = {
      data: { ...emptySnapshot(), artworks: [{ id: 'aw-001', thumbnail_url: thumbUrl }] },
      error: null,
    };
    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(downloadCalls).toEqual([{ bucket: 'thumbnails', path: 'aw-001/cover.jpg' }]);
    expect(filenames).toContain('artworks/aw-001.jpg');
    expect(manifest.image_count).toBe(1);
    expect((data.artworks as Array<Record<string, unknown>>)[0]).toMatchObject({
      thumbnail_url: 'artworks/aw-001.jpg',
      _original_thumbnail_url: thumbUrl,
    });
  });

  it('相对路径的 thumbnail_url → 默认 thumbnails bucket', async () => {
    rpcResponse = {
      data: { ...emptySnapshot(), artworks: [{ id: 'aw-rel', thumbnail_url: 'aw-rel/x.png' }] },
      error: null,
    };
    downloadImpl = async () => makeBlobResponse('image/png');

    const { buffer } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames } = await unpackZip(buffer);

    expect(downloadCalls).toEqual([{ bucket: 'thumbnails', path: 'aw-rel/x.png' }]);
    expect(filenames).toContain('artworks/aw-rel.png');
  });

  it('storage.download 失败 → 字段保留原值，不破坏 ZIP', async () => {
    downloadImpl = async () => ({ data: null, error: { message: 'not found' } });

    rpcResponse = {
      data: {
        ...emptySnapshot(),
        artworks: [{ id: 'aw-broken', thumbnail_url: 'https://x.supabase.co/storage/v1/object/public/thumbnails/x.jpg' }],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(filenames.some((n) => n.startsWith('artworks/aw-broken'))).toBe(false);
    expect(manifest.image_count).toBe(0);
    expect((data.artworks as Array<Record<string, unknown>>)[0].thumbnail_url).toMatch(
      /thumbnails\/x\.jpg$/,
    );
    expect((data.artworks as Array<Record<string, unknown>>)[0]._original_thumbnail_url).toBeUndefined();
  });

  it('非 supabase URL（外链） → parseStorageRef 返 null，字段保留原值', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        artworks: [{ id: 'aw-ext', thumbnail_url: 'https://cdn.example.com/x.jpg' }],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(downloadCalls).toEqual([]); // 没尝试下载外链
    expect(filenames.some((n) => n.startsWith('artworks/aw-ext'))).toBe(false);
    expect(manifest.image_count).toBe(0);
    expect((data.artworks as Array<Record<string, unknown>>)[0].thumbnail_url).toBe(
      'https://cdn.example.com/x.jpg',
    );
  });
});

// ====================================================
// edition_files.file_url — 全 source_type='upload' 扫描，PDF / doc 都备份
// ====================================================
describe('buildBackupZip — files/{id}.{ext} 打包（含 PDF / doc）', () => {
  it('source_type=upload + image：写 files/{id}.{ext} + _original_url 保留', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'ef-img',
            edition_id: 'ed-1',
            source_type: 'upload',
            file_url: 'ed-1/abc_pic.png',
            file_type: 'image',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };
    downloadImpl = async () => makeBlobResponse('image/png');

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(downloadCalls).toEqual([{ bucket: 'edition-files', path: 'ed-1/abc_pic.png' }]);
    expect(filenames).toContain('files/ef-img.png');
    expect(manifest.image_count).toBe(1);
    expect((data.edition_files as Array<Record<string, unknown>>)[0]).toMatchObject({
      file_url: 'files/ef-img.png',
      _original_url: 'ed-1/abc_pic.png',
    });
  });

  it('source_type=upload + pdf：扩展名走 storage path / file_name 兜底', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'ef-pdf',
            edition_id: 'ed-1',
            source_type: 'upload',
            file_url: 'ed-1/abc_certificate.pdf',
            file_type: 'pdf',
            file_name: 'certificate.pdf',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };
    downloadImpl = async () => makeBlobResponse('application/pdf');

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames } = await unpackZip(buffer);

    expect(filenames).toContain('files/ef-pdf.pdf');
    expect(manifest.image_count).toBe(1); // image_count = ZIP 内 binary asset 总数
  });

  it('source_type=upload + docx：path 没扩展、file_name 有', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'ef-doc',
            edition_id: 'ed-1',
            source_type: 'upload',
            file_url: 'ed-1/uuid-no-ext',
            file_type: 'document',
            file_name: 'spec.docx',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };
    downloadImpl = async () =>
      makeBlobResponse('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const { buffer } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames } = await unpackZip(buffer);

    // pickExtension 顺序：storage path → file_name → contentType → bin
    // path 没扩展 → file_name docx 命中
    expect(filenames).toContain('files/ef-doc.docx');
  });

  it('source_type=link 行：不下载，file_url 原样保留', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'ef-link',
            edition_id: 'ed-1',
            source_type: 'link',
            file_url: 'https://public.3.basecamp.com/p/Qe',
            file_type: 'document',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(downloadCalls).toEqual([]);
    expect(filenames.some((n) => n.startsWith('files/ef-link'))).toBe(false);
    expect(manifest.image_count).toBe(0);
    expect((data.edition_files as Array<Record<string, unknown>>)[0].file_url).toBe(
      'https://public.3.basecamp.com/p/Qe',
    );
    expect((data.edition_files as Array<Record<string, unknown>>)[0]._original_url).toBeUndefined();
  });

  it('download 失败 → 字段保留原值，warn 进 console，不破坏 ZIP', async () => {
    downloadImpl = async () => ({ data: null, error: { message: 'permission denied' } });

    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          {
            id: 'ef-fail',
            edition_id: 'ed-1',
            source_type: 'upload',
            file_url: 'ed-1/missing.pdf',
            file_type: 'pdf',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames, data } = await unpackZip(buffer);

    expect(filenames.some((n) => n.startsWith('files/ef-fail'))).toBe(false);
    expect(manifest.image_count).toBe(0);
    expect((data.edition_files as Array<Record<string, unknown>>)[0].file_url).toBe('ed-1/missing.pdf');
  });

  it('两条路径共存：artworks/ + files/ 子目录正确划分', async () => {
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        artworks: [
          {
            id: 'aw-A',
            thumbnail_url: 'https://x.supabase.co/storage/v1/object/public/thumbnails/aw-A/c.jpg',
          },
        ],
        edition_files: [
          {
            id: 'ef-B',
            edition_id: 'ed-1',
            source_type: 'upload',
            file_url: 'ed-1/file.pdf',
            file_type: 'pdf',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      error: null,
    };
    downloadImpl = async (bucket) =>
      makeBlobResponse(bucket === 'thumbnails' ? 'image/jpeg' : 'application/pdf');

    const { buffer, manifest } = await buildBackupZip('u', 'e', makeMockSupabase());
    const { filenames } = await unpackZip(buffer);

    expect(filenames).toContain('artworks/aw-A.jpg');
    expect(filenames).toContain('files/ef-B.pdf');
    expect(manifest.image_count).toBe(2);

    // 两次 download 走对应 bucket
    expect(downloadCalls).toEqual([
      { bucket: 'thumbnails', path: 'aw-A/c.jpg' },
      { bucket: 'edition-files', path: 'ed-1/file.pdf' },
    ]);
  });

  it('重复 (bucket, path) 只下载一次（去重）', async () => {
    const sharedPath = 'ed-1/shared.png';
    rpcResponse = {
      data: {
        ...emptySnapshot(),
        edition_files: [
          { id: 'f1', edition_id: 'e1', source_type: 'upload', file_url: sharedPath, file_type: 'image', created_at: '' },
          { id: 'f2', edition_id: 'e2', source_type: 'upload', file_url: sharedPath, file_type: 'image', created_at: '' },
        ],
      },
      error: null,
    };
    downloadImpl = async () => makeBlobResponse('image/png');

    const { manifest } = await buildBackupZip('u', 'e', makeMockSupabase());

    // 同一 bucket/path 只 download 一次
    expect(downloadCalls.length).toBe(1);
    expect(downloadCalls[0]).toEqual({ bucket: 'edition-files', path: sharedPath });
    // 但两条 row 都打包（image_count = 2）
    expect(manifest.image_count).toBe(2);
  });
});

// ====================================================
// 错误路径
// ====================================================
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

// ====================================================
// stats
// ====================================================
describe('buildBackupZip — stats 与数据一致', () => {
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
