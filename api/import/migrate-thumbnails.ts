// 批量迁移缩略图 API - 处理已有作品的外部图片

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../lib/auth.js';
import { processExternalImage, isSupabaseUrl } from './process-image.js';

// Vercel 配置：使用 Node.js runtime，延长超时
export const config = {
  runtime: 'nodejs',
  maxDuration: 60, // 批量处理需要更长时间
};

interface MigrateRequest {
  dryRun?: boolean;  // 预览模式，不实际执行
  artworkIds?: string[]; // 可选：只处理指定的作品
}

interface MigrateResult {
  artworkId: string;
  title: string;
  originalUrl: string;
  status: 'success' | 'failed' | 'skipped';
  newUrl?: string;
  error?: string;
}

interface MigrateResponse {
  total: number;
  processed: number;
  failed: number;
  skipped: number;
  results: MigrateResult[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 认证检查
  const authResult = await verifyAuth(req);
  if (!authResult.success) {
    return res.status(401).json({ error: authResult.error || 'Unauthorized' });
  }

  // 使用 service key 绕过 RLS
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
    const body: MigrateRequest = req.body || {};
    const { dryRun = false, artworkIds } = body;

    // 查询需要迁移的作品（有 thumbnail_url 且是外部 URL）
    let query = supabase
      .from('artworks')
      .select('id, title_en, title_cn, thumbnail_url')
      .not('thumbnail_url', 'is', null);

    // 如果指定了作品 ID，只处理这些作品
    if (artworkIds && artworkIds.length > 0) {
      query = query.in('id', artworkIds);
    }

    const { data: artworks, error: queryError } = await query;

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`);
    }

    // 过滤出需要迁移的作品（外部 URL）
    const artworksToMigrate = (artworks || []).filter(
      artwork => artwork.thumbnail_url && !isSupabaseUrl(artwork.thumbnail_url)
    );

    const response: MigrateResponse = {
      total: artworksToMigrate.length,
      processed: 0,
      failed: 0,
      skipped: 0,
      results: [],
    };

    // 如果是预览模式，只返回将要处理的作品列表
    if (dryRun) {
      response.results = artworksToMigrate.map(artwork => ({
        artworkId: artwork.id,
        title: artwork.title_en,
        originalUrl: artwork.thumbnail_url!,
        status: 'skipped' as const,
      }));
      response.skipped = artworksToMigrate.length;

      return res.json(response);
    }

    // 执行迁移
    for (const artwork of artworksToMigrate) {
      const result: MigrateResult = {
        artworkId: artwork.id,
        title: artwork.title_en,
        originalUrl: artwork.thumbnail_url!,
        status: 'skipped',
      };

      try {
        // 处理图片
        const processResult = await processExternalImage(
          artwork.thumbnail_url!,
          artwork.id,
          supabase
        );

        if (processResult.success && processResult.publicUrl) {
          // 更新数据库
          const { error: updateError } = await supabase
            .from('artworks')
            .update({ thumbnail_url: processResult.publicUrl })
            .eq('id', artwork.id);

          if (updateError) {
            throw new Error(`Update failed: ${updateError.message}`);
          }

          result.status = 'success';
          result.newUrl = processResult.publicUrl;
          response.processed++;
        } else {
          throw new Error(processResult.error || 'Processing failed');
        }
      } catch (error) {
        result.status = 'failed';
        result.error = error instanceof Error ? error.message : 'Unknown error';
        response.failed++;
      }

      response.results.push(result);
    }

    return res.json(response);
  } catch (error) {
    console.error('Migrate thumbnails API error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Migration failed' });
  }
}
