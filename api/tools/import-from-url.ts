import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { extractArtworkFromUrl } from '../lib/artwork-extractor.js';
import { selectBestImage } from '../lib/image-downloader.js';

/**
 * 创建从 URL 导入作品工具
 */
export function createImportFromUrlTool(ctx: ToolContext) {
  return tool({
    description: '从网页 URL 抓取作品信息并自动创建作品。会自动提取标题、年份、类型、尺寸、材料等信息，并获取缩略图 URL。',
    inputSchema: z.object({
      url: z.string().url().describe('作品页面的完整 URL'),
    }),
    execute: async ({ url }) => {
      const { supabase, extractionModel } = ctx;

      console.log('[import_artwork_from_url] Starting import:', url, 'model:', extractionModel || 'default');

      // 1. 抓取并解析网页（使用配置的提取模型）
      const extractResult = await extractArtworkFromUrl(url, extractionModel);

      if (!extractResult.success || !extractResult.artwork) {
        return {
          error: extractResult.error || '无法从页面提取作品信息',
        };
      }

      const { artwork, images } = extractResult;
      console.log('[import_artwork_from_url] Extracted:', artwork.title_en);

      // 2. 检查是否已存在（通过 source_url）
      let existingId: string | null = null;
      const { data: existingByUrl } = await supabase
        .from('artworks')
        .select('id, title_en')
        .eq('source_url', url)
        .is('deleted_at', null);

      if (existingByUrl && existingByUrl.length === 1) {
        existingId = existingByUrl[0].id;
        console.log('[import_artwork_from_url] Found existing by URL:', existingId);
      } else if (existingByUrl && existingByUrl.length > 1) {
        console.log('[import_artwork_from_url] Multiple artworks share this URL, will try title match or create new');
      }

      // 3. 如果没有通过 URL 找到，尝试通过标题匹配
      if (!existingId && artwork.title_en) {
        const { data: existingByTitle } = await supabase
          .from('artworks')
          .select('id, source_url')
          .eq('title_en', artwork.title_en)
          .is('deleted_at', null);

        if (existingByTitle && existingByTitle.length === 1) {
          const matched = existingByTitle[0];
          // 如果两者都有 source_url 且不同，视为不同作品
          if (!(url && matched.source_url && url !== matched.source_url)) {
            existingId = matched.id;
            console.log('[import_artwork_from_url] Found existing by title:', existingId);
          }
        }
      }

      // 4. 准备作品数据
      const artworkData: Record<string, unknown> = {
        title_en: artwork.title_en,
        title_cn: artwork.title_cn,
        year: artwork.year,
        type: artwork.type,
        dimensions: artwork.dimensions,
        materials: artwork.materials,
        duration: artwork.duration,
        source_url: url,
        updated_at: new Date().toISOString(),
      };

      let artworkId: string;
      let action: 'created' | 'updated';

      // 5. 创建或更新作品
      if (existingId) {
        // 更新现有作品
        const { error: updateError } = await supabase
          .from('artworks')
          .update(artworkData)
          .eq('id', existingId);

        if (updateError) {
          return { error: `更新作品失败: ${updateError.message}` };
        }

        artworkId = existingId;
        action = 'updated';
      } else {
        // 创建新作品
        artworkData.created_at = new Date().toISOString();
        const { data: newArtwork, error: insertError } = await supabase
          .from('artworks')
          .insert(artworkData)
          .select('id')
          .single();

        if (insertError || !newArtwork) {
          return { error: `创建作品失败: ${insertError?.message || '未知错误'}` };
        }

        artworkId = newArtwork.id;
        action = 'created';
      }

      // 6. 设置缩略图 URL（存储远程 URL，后续由系统自动压缩上传）
      const bestImage = selectBestImage(images);

      if (bestImage) {
        console.log('[import_artwork_from_url] Setting thumbnail URL:', bestImage);
        await supabase
          .from('artworks')
          .update({ thumbnail_url: bestImage })
          .eq('id', artworkId);
      }

      // 7. 返回结果
      const actionText = action === 'created' ? '已创建' : '已更新';
      const thumbnailText = bestImage ? '，已获取缩略图' : '';

      return {
        success: true,
        action,
        artwork_id: artworkId,
        artwork_title: artwork.title_en,
        has_thumbnail: !!bestImage,
        message: `${actionText}作品「${artwork.title_en}」${thumbnailText}`,
      };
    },
  });
}
