import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../lib/auth.js';
import { processExternalImage, isSupabaseUrl } from './process-image.js';

// Vercel 配置：使用 Node.js runtime（因为 process-image 使用 sharp）
export const config = {
  runtime: 'nodejs',
  maxDuration: 300, // 5 分钟，支持大批量导入
};

// 请求体类型
interface ImportArtwork {
  title_en: string;
  title_cn: string | null;
  year: string | null;
  type: string | null;
  dimensions: string | null;
  materials: string | null;
  duration: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  images?: string[]; // 可选：前端传递的图片列表，用于预览显示
}

interface ImportRequest {
  artworks: ImportArtwork[];
  mode: 'preview' | 'execute';
}

// 预览结果类型
interface PreviewResult {
  new: Array<{
    artwork: ImportArtwork;
    requiresThumbnail: boolean;
    availableImages: string[];
  }>;
  updates: Array<{
    existingId: string;
    existingArtwork: Record<string, unknown>;
    newData: ImportArtwork;
    changes: Array<{
      field: string;
      fieldLabel: string;
      oldValue: string | null;
      newValue: string | null;
    }>;
  }>;
  unchanged: Array<{
    existingId: string;
    title: string;
  }>;
}

// 执行结果类型
interface ExecuteResult {
  created: string[];
  updated: string[];
  errors: string[];
  imageProcessing?: {
    processed: number;
    failed: number;
  };
}

// 网站字段（允许导入时更新）
const WEBSITE_FIELDS = ['title_en', 'title_cn', 'year', 'type', 'dimensions', 'materials', 'duration'];

// 字段中文标签
const FIELD_LABELS: Record<string, string> = {
  title_en: '英文标题',
  title_cn: '中文标题',
  year: '年份',
  type: '类型',
  dimensions: '尺寸',
  materials: '材料',
  duration: '时长',
  thumbnail_url: '缩略图',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 认证检查
  const authResult = await verifyAuth(req);
  if (!authResult.success) {
    return res.status(401).json({ error: authResult.error || 'Unauthorized' });
  }

  // 使用 service key 绕过 RLS，支持新的 secret key 格式
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    serviceKey || process.env.VITE_SUPABASE_ANON_KEY!,
    serviceKey ? {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    } : undefined
  );

  try {
    const body: ImportRequest = req.body;

    if (body.mode === 'preview') {
      // 预览模式：分析变更
      const result: PreviewResult = {
        new: [],
        updates: [],
        unchanged: [],
      };

      for (const artwork of body.artworks) {
        // 通过 source_url 匹配已有作品（只匹配未删除的）
        let existing = null;
        if (artwork.source_url) {
          const { data } = await supabase
            .from('artworks')
            .select('*')
            .eq('source_url', artwork.source_url)
            .is('deleted_at', null);
          if (data && data.length === 1) {
            existing = data[0];
          }
        }

        // 如果没有 source_url 或没找到，尝试通过标题匹配（仅当只有一个匹配时，且未删除）
        // 但如果导入的作品有 source_url，而匹配到的作品有不同的 source_url，则视为不同作品
        if (!existing && artwork.title_en) {
          const { data } = await supabase
            .from('artworks')
            .select('*')
            .eq('title_en', artwork.title_en)
            .is('deleted_at', null);
          // 只有当恰好有一个匹配时才使用，避免同名作品冲突
          if (data && data.length === 1) {
            const matched = data[0];
            // 如果两者都有 source_url 且不同，则是不同作品（如同系列不同版本）
            if (artwork.source_url && matched.source_url && artwork.source_url !== matched.source_url) {
              // 不匹配，视为新作品
              console.log(`[MD Import] Same title but different source_url: "${artwork.title_en}" - treating as new artwork`);
            } else {
              existing = matched;
            }
          }
        }

        if (!existing) {
          // 新作品
          result.new.push({
            artwork,
            requiresThumbnail: !artwork.thumbnail_url,
            availableImages: [], // 前端会传递 images 数组
          });
        } else {
          // 检查是否有变更
          const changes: PreviewResult['updates'][0]['changes'] = [];

          for (const field of WEBSITE_FIELDS) {
            const oldVal = existing[field];
            const newVal = artwork[field as keyof ImportArtwork];

            // 标准化值：将空字符串、undefined 都视为 null（用于比较）
            const normalizedOld = (oldVal === '' || oldVal === undefined || oldVal === null) ? null : String(oldVal).trim();
            const normalizedNew = (newVal === '' || newVal === undefined || newVal === null) ? null : String(newVal).trim();

            // 调试日志
            if (normalizedOld !== normalizedNew) {
              console.log(`[MD Import] Field ${field}: old="${normalizedOld}" new="${normalizedNew}" (newIsNull=${normalizedNew === null})`);
            }

            // 只有新值有实际内容且与旧值不同时才记录变更
            // 不用空值覆盖已有值
            if (normalizedNew !== null && normalizedOld !== normalizedNew) {
              changes.push({
                field,
                fieldLabel: FIELD_LABELS[field] || field,
                oldValue: normalizedOld,
                newValue: normalizedNew,
              });
            }
          }

          if (changes.length > 0) {
            console.log('[MD Import] Artwork has changes:', existing.title_en, changes);
            result.updates.push({
              existingId: existing.id,
              existingArtwork: existing,
              newData: artwork,
              changes,
            });
          } else {
            console.log('[MD Import] Artwork unchanged:', existing.title_en);
            result.unchanged.push({
              existingId: existing.id,
              title: existing.title_en,
            });
          }
        }
      }

      return res.json(result);
    }

    // 执行模式：实际导入
    const results: ExecuteResult = {
      created: [],
      updated: [],
      errors: [],
      imageProcessing: {
        processed: 0,
        failed: 0,
      },
    };

    for (const artwork of body.artworks) {
      try {
        // 通过 source_url 或标题匹配已有作品（只匹配未删除的）
        let existing = null;
        if (artwork.source_url) {
          const { data } = await supabase
            .from('artworks')
            .select('id')
            .eq('source_url', artwork.source_url)
            .is('deleted_at', null);
          if (data && data.length === 1) {
            existing = data[0];
          }
        }
        if (!existing && artwork.title_en) {
          const { data } = await supabase
            .from('artworks')
            .select('id, source_url')
            .eq('title_en', artwork.title_en)
            .is('deleted_at', null);
          // 只有当恰好有一个匹配时才使用，避免同名作品冲突
          if (data && data.length === 1) {
            const matched = data[0];
            // 如果两者都有 source_url 且不同，则是不同作品（如同系列不同版本）
            if (artwork.source_url && matched.source_url && artwork.source_url !== matched.source_url) {
              // 不匹配，视为新作品
              console.log(`[MD Import Execute] Same title but different source_url: "${artwork.title_en}" - creating new artwork`);
            } else {
              existing = matched;
            }
          }
        }

        if (!existing) {
          // 创建新作品
          const { data, error } = await supabase
            .from('artworks')
            .insert({
              title_en: artwork.title_en,
              title_cn: artwork.title_cn,
              year: artwork.year,
              type: artwork.type,
              dimensions: artwork.dimensions,
              materials: artwork.materials,
              duration: artwork.duration,
              source_url: artwork.source_url,
              thumbnail_url: artwork.thumbnail_url,
            })
            .select('id')
            .single();

          if (error) throw error;

          // 处理缩略图：下载、压缩、上传到本地存储
          if (artwork.thumbnail_url && !isSupabaseUrl(artwork.thumbnail_url)) {
            try {
              const imageResult = await processExternalImage(
                artwork.thumbnail_url,
                data.id,
                supabase
              );
              if (imageResult.success && imageResult.publicUrl) {
                await supabase
                  .from('artworks')
                  .update({ thumbnail_url: imageResult.publicUrl })
                  .eq('id', data.id);
                results.imageProcessing!.processed++;
              } else {
                // 图片处理失败，保留原 URL
                results.imageProcessing!.failed++;
              }
            } catch (imgErr) {
              // 图片处理失败不影响作品创建
              console.warn('Image processing failed for new artwork:', imgErr);
              results.imageProcessing!.failed++;
            }
          }

          results.created.push(data.id);
        } else {
          // 更新现有作品（只更新网站字段，保护管理字段）
          const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };

          for (const field of WEBSITE_FIELDS) {
            const val = artwork[field as keyof ImportArtwork];
            if (val !== null && val !== undefined) {
              updateData[field] = val;
            }
          }

          // 缩略图：只有当新值存在且当前为空时才更新
          if (artwork.thumbnail_url) {
            const { data: currentArtwork } = await supabase
              .from('artworks')
              .select('thumbnail_url')
              .eq('id', existing.id)
              .single();

            if (!currentArtwork?.thumbnail_url) {
              // 处理缩略图：下载、压缩、上传到本地存储
              if (!isSupabaseUrl(artwork.thumbnail_url)) {
                try {
                  const imageResult = await processExternalImage(
                    artwork.thumbnail_url,
                    existing.id,
                    supabase
                  );
                  if (imageResult.success && imageResult.publicUrl) {
                    updateData.thumbnail_url = imageResult.publicUrl;
                    results.imageProcessing!.processed++;
                  } else {
                    // 图片处理失败，使用原 URL
                    updateData.thumbnail_url = artwork.thumbnail_url;
                    results.imageProcessing!.failed++;
                  }
                } catch (imgErr) {
                  console.warn('Image processing failed for existing artwork:', imgErr);
                  updateData.thumbnail_url = artwork.thumbnail_url;
                  results.imageProcessing!.failed++;
                }
              } else {
                updateData.thumbnail_url = artwork.thumbnail_url;
              }
            }
          }

          const { error } = await supabase
            .from('artworks')
            .update(updateData)
            .eq('id', existing.id);

          if (error) throw error;
          results.updated.push(existing.id);
        }
      } catch (err: unknown) {
        // Supabase 错误对象有 message 属性但不是 Error 实例
        const errMsg = (err as { message?: string })?.message || JSON.stringify(err);
        results.errors.push(`${artwork.title_en}: ${errMsg}`);
      }
    }

    return res.json(results);
  } catch (err) {
    console.error('Import API error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Import failed' });
  }
}
