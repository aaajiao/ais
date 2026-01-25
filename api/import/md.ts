import { createClient } from '@supabase/supabase-js';
import { verifyAuth, unauthorizedResponse } from '../lib/auth';

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

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 认证检查
  const authResult = await verifyAuth(req);
  if (!authResult.success) {
    return unauthorizedResponse(authResult.error || 'Unauthorized');
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
    const body: ImportRequest = await req.json();

    if (body.mode === 'preview') {
      // 预览模式：分析变更
      const result: PreviewResult = {
        new: [],
        updates: [],
        unchanged: [],
      };

      for (const artwork of body.artworks) {
        // 通过 source_url 匹配已有作品
        let existing = null;
        if (artwork.source_url) {
          const { data } = await supabase
            .from('artworks')
            .select('*')
            .eq('source_url', artwork.source_url)
            .single();
          existing = data;
        }

        // 如果没有 source_url 或没找到，尝试通过标题匹配（仅当只有一个匹配时）
        if (!existing && artwork.title_en) {
          const { data } = await supabase
            .from('artworks')
            .select('*')
            .eq('title_en', artwork.title_en);
          // 只有当恰好有一个匹配时才使用，避免同名作品冲突
          if (data && data.length === 1) {
            existing = data[0];
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
            // 只有新值存在且与旧值不同时才记录变更
            if (newVal !== null && newVal !== undefined && oldVal !== newVal) {
              changes.push({
                field,
                fieldLabel: FIELD_LABELS[field] || field,
                oldValue: oldVal ?? null,
                newValue: newVal as string | null,
              });
            }
          }

          if (changes.length > 0) {
            result.updates.push({
              existingId: existing.id,
              existingArtwork: existing,
              newData: artwork,
              changes,
            });
          } else {
            result.unchanged.push({
              existingId: existing.id,
              title: existing.title_en,
            });
          }
        }
      }

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 执行模式：实际导入
    const results: ExecuteResult = {
      created: [],
      updated: [],
      errors: [],
    };

    for (const artwork of body.artworks) {
      try {
        // 通过 source_url 或标题匹配已有作品
        let existing = null;
        if (artwork.source_url) {
          const { data } = await supabase
            .from('artworks')
            .select('id')
            .eq('source_url', artwork.source_url)
            .single();
          existing = data;
        }
        if (!existing && artwork.title_en) {
          const { data } = await supabase
            .from('artworks')
            .select('id')
            .eq('title_en', artwork.title_en);
          // 只有当恰好有一个匹配时才使用，避免同名作品冲突
          if (data && data.length === 1) {
            existing = data[0];
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
              updateData.thumbnail_url = artwork.thumbnail_url;
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

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Import API error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Import failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
