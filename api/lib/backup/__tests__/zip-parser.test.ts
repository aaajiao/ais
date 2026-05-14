/**
 * zip-parser 测试：覆盖 ZIP 结构 + manifest 字段存在性校验
 *
 * 业务校验（user_id 匹配 / schema 版本）不在这里测，那是 handler 的责任。
 * parser 只管"这是一份结构合法的本系统备份"。
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseBackupZip } from '../zip-parser';
import { BACKUP_FORMAT_VERSION, DB_SCHEMA_VERSION, type BackupManifest } from '../manifest';

// =====================================================
// Fixture 工具：构造合法的备份 ZIP
// =====================================================

function makeManifest(overrides: Partial<BackupManifest> = {}): BackupManifest {
  return {
    backup_format_version: BACKUP_FORMAT_VERSION,
    db_schema_version: DB_SCHEMA_VERSION,
    user_id: 'user-test',
    user_email: 'a@b.com',
    created_at: '2026-05-14T03:00:00.000Z',
    stats: {
      artworks: 0,
      editions: 0,
      edition_files: 0,
      edition_history: 0,
      locations: 0,
      gallery_links: 0,
      api_keys: 0,
    },
    image_count: 0,
    total_size_bytes: 1024,
    ...overrides,
  };
}

function emptyData() {
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

async function buildZip(opts: {
  manifest?: unknown; // 允许传非法 manifest 测错误路径
  data?: unknown;
  skipManifest?: boolean;
  skipData?: boolean;
  manifestJsonString?: string; // 测无效 JSON
  dataJsonString?: string;
  /** 写入 artworks/ 子目录 */
  artworkAssets?: Array<{ name: string; content: Uint8Array }>;
  /** 写入 files/ 子目录 */
  fileAssets?: Array<{ name: string; content: Uint8Array }>;
}): Promise<Buffer> {
  const zip = new JSZip();
  if (!opts.skipManifest) {
    const content =
      opts.manifestJsonString !== undefined
        ? opts.manifestJsonString
        : JSON.stringify(opts.manifest ?? makeManifest());
    zip.file('manifest.json', content);
  }
  if (!opts.skipData) {
    const content =
      opts.dataJsonString !== undefined
        ? opts.dataJsonString
        : JSON.stringify(opts.data ?? emptyData());
    zip.file('data.json', content);
  }
  if (opts.artworkAssets) {
    const f = zip.folder('artworks');
    if (!f) throw new Error('failed to create artworks folder');
    for (const a of opts.artworkAssets) f.file(a.name, a.content);
  }
  if (opts.fileAssets) {
    const f = zip.folder('files');
    if (!f) throw new Error('failed to create files folder');
    for (const a of opts.fileAssets) f.file(a.name, a.content);
  }
  return await zip.generateAsync({ type: 'nodebuffer' });
}

// =====================================================
// 测试：happy path
// =====================================================

describe('parseBackupZip — 合法备份', () => {
  it('空数据 ZIP：返回 manifest + 空 data + lookup helpers', async () => {
    const buf = await buildZip({});
    const parsed = await parseBackupZip(buf);
    expect(parsed.manifest.user_id).toBe('user-test');
    expect(parsed.data.artworks).toEqual([]);
    expect(typeof parsed.getArtworkThumbnail).toBe('function');
    expect(typeof parsed.getEditionFileAttachment).toBe('function');
  });

  it('manifest 所有 8 个必填字段都返回', async () => {
    const buf = await buildZip({});
    const parsed = await parseBackupZip(buf);
    expect(parsed.manifest).toMatchObject({
      backup_format_version: expect.any(Number),
      db_schema_version: expect.any(String),
      user_id: expect.any(String),
      user_email: expect.any(String),
      created_at: expect.any(String),
      stats: expect.any(Object),
      image_count: expect.any(Number),
      total_size_bytes: expect.any(Number),
    });
  });

  it('stats 含 7 张表的行数', async () => {
    const buf = await buildZip({
      manifest: makeManifest({
        stats: {
          artworks: 5,
          editions: 10,
          edition_files: 20,
          edition_history: 30,
          locations: 2,
          gallery_links: 1,
          api_keys: 3,
        },
      }),
    });
    const parsed = await parseBackupZip(buf);
    expect(parsed.manifest.stats.artworks).toBe(5);
    expect(parsed.manifest.stats.api_keys).toBe(3);
  });
});

// =====================================================
// 测试：getArtworkThumbnail / getEditionFileAttachment 懒加载
// =====================================================

describe('parseBackupZip — getArtworkThumbnail', () => {
  it('找到匹配 artwork_id 的图片 → 返回 buffer + contentType', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const buf = await buildZip({
      artworkAssets: [{ name: 'aw-001.png', content: pngBytes }],
    });
    const parsed = await parseBackupZip(buf);
    const asset = await parsed.getArtworkThumbnail('aw-001');
    expect(asset).not.toBeNull();
    expect(asset?.contentType).toBe('image/png');
    expect(asset?.buffer).toEqual(Buffer.from(pngBytes));
  });

  it('jpg 扩展名 → contentType image/jpeg', async () => {
    const buf = await buildZip({
      artworkAssets: [{ name: 'f1.jpg', content: new Uint8Array([0xff, 0xd8]) }],
    });
    const parsed = await parseBackupZip(buf);
    const asset = await parsed.getArtworkThumbnail('f1');
    expect(asset?.contentType).toBe('image/jpeg');
  });

  it('找不到对应 artwork_id → 返回 null', async () => {
    const buf = await buildZip({});
    const parsed = await parseBackupZip(buf);
    expect(await parsed.getArtworkThumbnail('non-existent')).toBeNull();
  });

  it('artworks/ 与 files/ 子目录不串扰：相同 ID 不会跨目录命中', async () => {
    const buf = await buildZip({
      artworkAssets: [{ name: 'shared-id.png', content: new Uint8Array([1]) }],
      fileAssets: [{ name: 'shared-id.pdf', content: new Uint8Array([2]) }],
    });
    const parsed = await parseBackupZip(buf);
    const a = await parsed.getArtworkThumbnail('shared-id');
    const b = await parsed.getEditionFileAttachment('shared-id');
    expect(a?.contentType).toBe('image/png');
    expect(b?.contentType).toBe('application/pdf');
  });
});

describe('parseBackupZip — getEditionFileAttachment', () => {
  it('pdf 扩展名 → application/pdf', async () => {
    const buf = await buildZip({
      fileAssets: [{ name: 'ef-1.pdf', content: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }],
    });
    const parsed = await parseBackupZip(buf);
    const asset = await parsed.getEditionFileAttachment('ef-1');
    expect(asset?.contentType).toBe('application/pdf');
  });

  it('docx 扩展名 → wordprocessingml mime', async () => {
    const buf = await buildZip({
      fileAssets: [{ name: 'ef-doc.docx', content: new Uint8Array([0x50, 0x4b]) }],
    });
    const parsed = await parseBackupZip(buf);
    const asset = await parsed.getEditionFileAttachment('ef-doc');
    expect(asset?.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('未知扩展名 → fallback application/octet-stream', async () => {
    const buf = await buildZip({
      fileAssets: [{ name: 'f1.xyz', content: new Uint8Array([0x00]) }],
    });
    const parsed = await parseBackupZip(buf);
    const asset = await parsed.getEditionFileAttachment('f1');
    expect(asset?.contentType).toBe('application/octet-stream');
  });

  it('找不到对应 fileId → 返回 null（不抛错）', async () => {
    const buf = await buildZip({});
    const parsed = await parseBackupZip(buf);
    expect(await parsed.getEditionFileAttachment('non-existent')).toBeNull();
  });
});

// =====================================================
// 测试：错误路径
// =====================================================

describe('parseBackupZip — 错误路径', () => {
  it('ZIP buffer 无效 → 抛 "Failed to read ZIP"', async () => {
    const notAZip = Buffer.from('not a zip file');
    await expect(parseBackupZip(notAZip)).rejects.toThrow(/Failed to read ZIP/);
  });

  it('缺 manifest.json → 抛 "manifest.json not found"', async () => {
    const buf = await buildZip({ skipManifest: true });
    await expect(parseBackupZip(buf)).rejects.toThrow(/manifest.json not found/);
  });

  it('manifest.json 不是合法 JSON → 抛 "not valid JSON"', async () => {
    const buf = await buildZip({ manifestJsonString: '{invalid json' });
    await expect(parseBackupZip(buf)).rejects.toThrow(/not valid JSON/);
  });

  it('manifest 缺必填字段 user_id → 抛错', async () => {
    const m = makeManifest();
    delete (m as Partial<BackupManifest>).user_id;
    const buf = await buildZip({ manifest: m });
    await expect(parseBackupZip(buf)).rejects.toThrow(/missing required field "user_id"/);
  });

  it('manifest.stats 不是对象 → 抛错', async () => {
    const buf = await buildZip({
      manifest: { ...makeManifest(), stats: 'not-an-object' },
    });
    await expect(parseBackupZip(buf)).rejects.toThrow(/stats must be an object/);
  });

  it('manifest.stats 缺某张表 → 抛错指明哪张表', async () => {
    const buf = await buildZip({
      manifest: makeManifest({
        stats: {
          artworks: 0,
          editions: 0,
          // 缺 edition_files
          edition_history: 0,
          locations: 0,
          gallery_links: 0,
          api_keys: 0,
        } as never,
      }),
    });
    await expect(parseBackupZip(buf)).rejects.toThrow(/stats missing table "edition_files"/);
  });

  it('缺 data.json → 抛错', async () => {
    const buf = await buildZip({ skipData: true });
    await expect(parseBackupZip(buf)).rejects.toThrow(/data.json not found/);
  });

  it('data.json 缺某张表数组 → 抛错指明哪张表', async () => {
    const partial = { ...emptyData() } as Record<string, unknown>;
    delete partial.gallery_links;
    const buf = await buildZip({ data: partial });
    await expect(parseBackupZip(buf)).rejects.toThrow(/"gallery_links" must be an array/);
  });

  it('data.json 某张表是对象而非数组 → 抛错', async () => {
    const buf = await buildZip({
      data: { ...emptyData(), artworks: { not: 'array' } } as never,
    });
    await expect(parseBackupZip(buf)).rejects.toThrow(/"artworks" must be an array/);
  });
});
