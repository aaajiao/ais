/**
 * restore 测试：覆盖式恢复的核心契约
 *
 * Mock 设计原则
 * -------------
 * Supabase chain (`from().select().eq()` / `from().delete().in()` / `from().insert()` /
 * `storage.from().upload()` / `storage.from().getPublicUrl()`) 用最小可工作 fake 模拟。
 * 关注**调用顺序、调用次数、payload 内容**，不模拟真实 PG 行为。
 *
 * 测试目标
 * --------
 * 1. DELETE 按反 FK 顺序执行；任一表 error → 整体抛错
 * 2. 图片重传：file_type='image' + file_url 以 'images/' 开头 → upload thumbnails + 改写 URL
 * 3. 图片找不到 / 上传失败 → fallback 到 _original_url，warning 进 result
 * 4. 非 image 行保留原 file_url，`_original_url` 字段在 INSERT 前一律 strip
 * 5. INSERT 按正 FK 顺序；任一表 error → 抛错
 * 6. >500 行 → 分批 INSERT
 */

import { describe, it, expect, vi } from 'vitest';
import { restoreBackup } from '../restore';
import type { BackupManifest, BackupData } from '../manifest';
import type { ParsedBackup, ParsedBackupImage } from '../zip-parser';

// =====================================================
// 类型 + 工具
// =====================================================

interface FakeConfig {
  /** select id 时各表返回的 rows */
  selects?: Record<string, { id: string }[]>;
  /** delete().eq/in() 返回的 count */
  deleteCounts?: Record<string, number>;
  /** 注入错误：key = `delete_<table>` 或 `insert_<table>` */
  errors?: Record<string, string>;
  /** Storage upload 是否对某 path 失败 */
  storageUploadShouldFail?: (path: string) => boolean;
}

interface FakeRecorder {
  capturedInserts: Record<string, Record<string, unknown>[]>;
  capturedUploads: Array<{
    bucket: string;
    path: string;
    contentType: string;
  }>;
  /** 表 DELETE 调用顺序，用于断言反 FK 顺序 */
  deleteCallOrder: string[];
  /** 表 INSERT 调用顺序 */
  insertCallOrder: string[];
}

function makeFakeSupabase(cfg: FakeConfig) {
  const rec: FakeRecorder = {
    capturedInserts: {},
    capturedUploads: [],
    deleteCallOrder: [],
    insertCallOrder: [],
  };

  function deleteResult(table: string) {
    const err = cfg.errors?.[`delete_${table}`];
    return {
      error: err ? { message: err } : null,
      count: cfg.deleteCounts?.[table] ?? 0,
    };
  }

  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq: () => Promise.resolve({ data: cfg.selects?.[table] ?? [], error: null }),
            in: () => Promise.resolve({ data: cfg.selects?.[table] ?? [], error: null }),
          };
        },
        delete() {
          rec.deleteCallOrder.push(table);
          return {
            eq: () => Promise.resolve(deleteResult(table)),
            in: () => Promise.resolve(deleteResult(table)),
          };
        },
        insert(rows: Record<string, unknown>[]) {
          rec.insertCallOrder.push(table);
          rec.capturedInserts[table] = (rec.capturedInserts[table] ?? []).concat(rows);
          const err = cfg.errors?.[`insert_${table}`];
          return Promise.resolve({ error: err ? { message: err } : null });
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          upload: (
            path: string,
            _buf: Buffer,
            opts: { contentType: string; upsert: boolean },
          ) => {
            rec.capturedUploads.push({ bucket, path, contentType: opts.contentType });
            if (cfg.storageUploadShouldFail?.(path)) {
              return Promise.resolve({ error: { message: 'upload failed' } });
            }
            return Promise.resolve({ error: null });
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://fake.example/${bucket}/${path}` },
          }),
        };
      },
    },
  };

  return { client: client as never, rec };
}

function manifest(): BackupManifest {
  return {
    backup_format_version: 1,
    db_schema_version: '2026.05',
    user_id: 'user-1',
    user_email: 'a@b.com',
    created_at: '2026-05-14T03:00:00Z',
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
    total_size_bytes: 0,
  };
}

function makeParsed(
  dataOverrides: Partial<BackupData> = {},
  images: Record<string, ParsedBackupImage> = {},
): ParsedBackup {
  const data: BackupData = {
    artworks: [],
    editions: [],
    edition_files: [],
    edition_history: [],
    locations: [],
    gallery_links: [],
    api_keys: [],
    ...dataOverrides,
  };
  return {
    manifest: manifest(),
    data,
    getImage: vi.fn(async (id: string) => images[id] ?? null),
  };
}

// =====================================================
// 测试：空备份
// =====================================================

describe('restoreBackup — 空备份', () => {
  it('空数据：DELETE 全跑（哪怕当前用户也是空）+ INSERT 全跑（0 行）+ 无 warnings', async () => {
    const { client, rec } = makeFakeSupabase({});
    const result = await restoreBackup({
      userId: 'user-1',
      supabase: client,
      parsed: makeParsed(),
    });

    // 7 张表 INSERT 都被调（即使 0 行）—— 这是当前实现：insertInBatches 早返不调 supabase
    // 所以 insertCallOrder 应该是空的，因为 rows.length === 0 直接 return
    expect(rec.insertCallOrder).toEqual([]);

    expect(result.imagesRestored).toBe(0);
    expect(result.imagesFailed).toBe(0);
    expect(result.warnings).toEqual([]);
  });
});

// =====================================================
// 测试：DELETE 反 FK 顺序
// =====================================================

describe('restoreBackup — DELETE 反 FK 顺序', () => {
  it('有数据时按 edition_history → edition_files → editions → gallery_links → api_keys → locations → artworks 顺序', async () => {
    const { client, rec } = makeFakeSupabase({
      selects: {
        artworks: [{ id: 'aw-1' }],
        editions: [{ id: 'ed-1' }],
      },
    });
    await restoreBackup({
      userId: 'user-1',
      supabase: client,
      parsed: makeParsed(),
    });

    expect(rec.deleteCallOrder).toEqual([
      'edition_history',
      'edition_files',
      'editions',
      'gallery_links',
      'api_keys',
      'locations',
      'artworks',
    ]);
  });

  it('用户没数据（artworks 空）→ 跳过 edition_* 的 delete', async () => {
    const { client, rec } = makeFakeSupabase({
      selects: { artworks: [] },
    });
    await restoreBackup({
      userId: 'user-1',
      supabase: client,
      parsed: makeParsed(),
    });

    // edition_* 不调（artworkIds / editionIds 都为空）；其余 4 张表都调
    expect(rec.deleteCallOrder).toEqual(['gallery_links', 'api_keys', 'locations', 'artworks']);
  });

  it('DELETE 任一表失败 → 抛错', async () => {
    const { client } = makeFakeSupabase({
      errors: { delete_locations: 'permission denied' },
    });
    await expect(
      restoreBackup({
        userId: 'user-1',
        supabase: client,
        parsed: makeParsed(),
      }),
    ).rejects.toThrow(/delete locations failed.*permission denied/);
  });
});

// =====================================================
// 测试：图片重传
// =====================================================

describe('restoreBackup — 图片重传到 thumbnails', () => {
  it('image 类型 + images/ 前缀 → upload 到 thumbnails + 改写为 public URL + 删 _original_url', async () => {
    const { client, rec } = makeFakeSupabase({});
    const parsed = makeParsed(
      {
        edition_files: [
          {
            id: 'f1',
            edition_id: 'ed-1',
            file_type: 'image',
            file_url: 'images/f1.jpg',
            _original_url: 'https://old-thumbnails.example/f1.jpg',
          },
        ],
      },
      {
        f1: { buffer: Buffer.from([0xff, 0xd8]), contentType: 'image/jpeg' },
      },
    );
    const result = await restoreBackup({ userId: 'user-1', supabase: client, parsed });

    expect(result.imagesRestored).toBe(1);
    expect(result.imagesFailed).toBe(0);
    expect(rec.capturedUploads).toEqual([
      { bucket: 'thumbnails', path: 'restored/f1.jpg', contentType: 'image/jpeg' },
    ]);

    const insertedFile = rec.capturedInserts.edition_files[0];
    expect(insertedFile.file_url).toBe('https://fake.example/thumbnails/restored/f1.jpg');
    expect(insertedFile._original_url).toBeUndefined();
  });

  it('image 但 getImage 返回 null（ZIP 内没图）→ fallback 到 _original_url + warning', async () => {
    const { client, rec } = makeFakeSupabase({});
    const parsed = makeParsed({
      edition_files: [
        {
          id: 'missing-img',
          edition_id: 'ed-1',
          file_type: 'image',
          file_url: 'images/missing-img.jpg',
          _original_url: 'https://original.example/img.jpg',
        },
      ],
    });
    const result = await restoreBackup({ userId: 'user-1', supabase: client, parsed });

    expect(result.imagesRestored).toBe(0);
    expect(result.imagesFailed).toBe(1);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatch(/Image not found in ZIP for edition_file missing-img/);

    const insertedFile = rec.capturedInserts.edition_files[0];
    expect(insertedFile.file_url).toBe('https://original.example/img.jpg');
    expect(insertedFile._original_url).toBeUndefined(); // 即使 fallback，DB 字段也不该有
  });

  it('Storage upload 失败 → fallback + warning，row 仍 INSERT', async () => {
    const { client, rec } = makeFakeSupabase({
      storageUploadShouldFail: () => true,
    });
    const parsed = makeParsed(
      {
        edition_files: [
          {
            id: 'f1',
            edition_id: 'ed-1',
            file_type: 'image',
            file_url: 'images/f1.jpg',
            _original_url: 'https://orig.example/f1.jpg',
          },
        ],
      },
      { f1: { buffer: Buffer.from([1]), contentType: 'image/jpeg' } },
    );
    const result = await restoreBackup({ userId: 'user-1', supabase: client, parsed });

    expect(result.imagesFailed).toBe(1);
    expect(result.warnings[0]).toMatch(/Upload failed for edition_file f1/);

    const inserted = rec.capturedInserts.edition_files[0];
    expect(inserted.file_url).toBe('https://orig.example/f1.jpg');
    expect(inserted._original_url).toBeUndefined();
  });

  it('artwork.thumbnail_url + images/ 前缀 → upload + 改写为 public URL + 删 _original_thumbnail_url', async () => {
    const { client, rec } = makeFakeSupabase({});
    const parsed = makeParsed(
      {
        artworks: [
          {
            id: 'aw-1',
            thumbnail_url: 'images/aw-1.jpg',
            _original_thumbnail_url: 'https://old.example/aw-1.jpg',
          },
        ],
      },
      { 'aw-1': { buffer: Buffer.from([0xff]), contentType: 'image/jpeg' } },
    );
    const result = await restoreBackup({ userId: 'user-1', supabase: client, parsed });

    expect(result.imagesRestored).toBe(1);
    expect(result.imagesFailed).toBe(0);
    // 走的还是 thumbnails bucket + restored/{id}.{ext} 路径约定
    expect(rec.capturedUploads).toContainEqual({
      bucket: 'thumbnails',
      path: 'restored/aw-1.jpg',
      contentType: 'image/jpeg',
    });

    const insertedArt = rec.capturedInserts.artworks[0];
    expect(insertedArt.thumbnail_url).toBe('https://fake.example/thumbnails/restored/aw-1.jpg');
    expect(insertedArt._original_thumbnail_url).toBeUndefined();
  });

  it('artwork.thumbnail_url getImage 返回 null → fallback 到 _original_thumbnail_url + warning', async () => {
    const { client, rec } = makeFakeSupabase({});
    const parsed = makeParsed({
      artworks: [
        {
          id: 'aw-missing',
          thumbnail_url: 'images/aw-missing.jpg',
          _original_thumbnail_url: 'https://original.example/aw.jpg',
        },
      ],
    });
    const result = await restoreBackup({ userId: 'user-1', supabase: client, parsed });

    expect(result.imagesFailed).toBe(1);
    expect(result.warnings[0]).toMatch(/Thumbnail not found in ZIP for artwork aw-missing/);

    const insertedArt = rec.capturedInserts.artworks[0];
    expect(insertedArt.thumbnail_url).toBe('https://original.example/aw.jpg');
    expect(insertedArt._original_thumbnail_url).toBeUndefined();
  });

  it('artwork 无 thumbnail_url 或绝对 URL：不 upload，_original_thumbnail_url 仍剥离', async () => {
    const { client, rec } = makeFakeSupabase({});
    const parsed = makeParsed({
      artworks: [
        { id: 'aw-no-thumb' }, // 没 thumbnail_url
        {
          id: 'aw-abs',
          thumbnail_url: 'https://existing.example/x.jpg', // 已经是绝对 URL，不走 ZIP
          _original_thumbnail_url: 'should-be-stripped',
        },
      ],
    });
    await restoreBackup({ userId: 'user-1', supabase: client, parsed });

    // 没有任何 upload 调用（fake supabase rec.capturedUploads 为空）
    expect(rec.capturedUploads).toEqual([]);
    const arts = rec.capturedInserts.artworks;
    expect(arts[0].thumbnail_url).toBeUndefined();
    expect(arts[1].thumbnail_url).toBe('https://existing.example/x.jpg');
    expect(arts[0]._original_thumbnail_url).toBeUndefined();
    expect(arts[1]._original_thumbnail_url).toBeUndefined();
  });

  it('非 image 类型 → 不动 file_url，不 upload，_original_url 仍剥离', async () => {
    const { client, rec } = makeFakeSupabase({});
    const parsed = makeParsed({
      edition_files: [
        {
          id: 'doc',
          edition_id: 'ed-1',
          file_type: 'pdf',
          file_url: 'https://example.com/doc.pdf',
          _original_url: 'https://example.com/doc.pdf',
        },
      ],
    });
    await restoreBackup({ userId: 'user-1', supabase: client, parsed });

    expect(rec.capturedUploads).toEqual([]);
    const inserted = rec.capturedInserts.edition_files[0];
    expect(inserted.file_url).toBe('https://example.com/doc.pdf');
    expect(inserted._original_url).toBeUndefined();
  });
});

// =====================================================
// 测试：INSERT 正 FK 顺序
// =====================================================

describe('restoreBackup — INSERT 正 FK 顺序', () => {
  it('artworks → locations → api_keys → editions → edition_files → edition_history → gallery_links', async () => {
    const { client, rec } = makeFakeSupabase({});
    const parsed = makeParsed({
      artworks: [{ id: 'aw1' }],
      locations: [{ id: 'l1' }],
      api_keys: [{ id: 'k1' }],
      editions: [{ id: 'ed1' }],
      edition_files: [{ id: 'f1', file_type: 'pdf', file_url: 'x' }],
      edition_history: [{ id: 'h1' }],
      gallery_links: [{ id: 'g1' }],
    });
    await restoreBackup({ userId: 'user-1', supabase: client, parsed });

    expect(rec.insertCallOrder).toEqual([
      'artworks',
      'locations',
      'api_keys',
      'editions',
      'edition_files',
      'edition_history',
      'gallery_links',
    ]);
  });

  it('某表 INSERT 失败 → 抛错带表名 + 原因', async () => {
    const { client } = makeFakeSupabase({
      errors: { insert_editions: 'FK violation: artwork_id' },
    });
    const parsed = makeParsed({
      artworks: [{ id: 'a1' }],
      editions: [{ id: 'e1', artwork_id: 'a1' }],
    });
    await expect(
      restoreBackup({ userId: 'user-1', supabase: client, parsed }),
    ).rejects.toThrow(/INSERT into editions failed.*FK violation/);
  });
});

// =====================================================
// 测试：批量插入
// =====================================================

describe('restoreBackup — 批量 INSERT', () => {
  it('>500 行 → 触发多批 INSERT 调用（同一 table 多次 from().insert）', async () => {
    const { client, rec } = makeFakeSupabase({});
    const manyRows = Array.from({ length: 1200 }, (_, i) => ({ id: `aw-${i}` }));
    const parsed = makeParsed({ artworks: manyRows });
    await restoreBackup({ userId: 'user-1', supabase: client, parsed });

    // 1200 / 500 = 3 批
    const artworksInsertCalls = rec.insertCallOrder.filter((t) => t === 'artworks');
    expect(artworksInsertCalls.length).toBe(3);

    expect(rec.capturedInserts.artworks.length).toBe(1200);
  });
});

// =====================================================
// 测试：onProgress 回调
// =====================================================

describe('restoreBackup — onProgress', () => {
  it('按步骤发出 progress 事件', async () => {
    const { client } = makeFakeSupabase({});
    const events: string[] = [];
    await restoreBackup({
      userId: 'user-1',
      supabase: client,
      parsed: makeParsed({ artworks: [{ id: 'a1' }] }),
      onProgress: (step) => events.push(step),
    });

    expect(events).toContain('delete:start');
    expect(events).toContain('delete:done');
    expect(events).toContain('images:start');
    expect(events).toContain('images:done');
    expect(events).toContain('insert:artworks');
    expect(events[events.length - 1]).toBe('done');
  });
});
