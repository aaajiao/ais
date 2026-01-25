/**
 * Image Downloader - 下载图片并上传到 Supabase Storage
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 下载图片并上传到 Supabase Storage
 * @param imageUrl 图片 URL
 * @param artworkId 作品 ID
 * @param supabase Supabase 客户端
 * @returns 上传后的公开 URL，失败返回 null
 */
export async function downloadAndUploadImage(
  imageUrl: string,
  artworkId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    // 1. 下载图片
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 秒超时

    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[image-downloader] Failed to download: HTTP ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();

    // 2. 检测图片类型
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    let ext = 'jpg';
    if (contentType.includes('png')) {
      ext = 'png';
    } else if (contentType.includes('webp')) {
      ext = 'webp';
    } else if (contentType.includes('gif')) {
      ext = 'gif';
    }

    // 3. 生成文件名
    const filename = `${artworkId}/thumbnail.${ext}`;

    // 4. 上传到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(filename, buffer, {
        contentType,
        upsert: true, // 覆盖已有文件
      });

    if (uploadError) {
      console.error('[image-downloader] Upload error:', uploadError);
      return null;
    }

    // 5. 获取公开 URL
    const { data: { publicUrl } } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(filename);

    console.log(`[image-downloader] Uploaded: ${filename}`);
    return publicUrl;
  } catch (error) {
    console.error('[image-downloader] Error:', error);
    return null;
  }
}

/**
 * 从图片 URL 列表中选择最合适的一张
 * 优先选择：
 * 1. 来自 payload.cargocollective.com 或 cargo.site 的图片
 * 2. 较大的图片（通过 URL 中的尺寸参数判断）
 * 3. 列表中的第一张
 */
export function selectBestImage(images: string[]): string | null {
  if (images.length === 0) return null;

  // 优先选择 CDN 图片
  const cdnImage = images.find(
    img => img.includes('payload.cargocollective.com') || img.includes('cargo.site')
  );
  if (cdnImage) return cdnImage;

  // 尝试找较大尺寸的图片（URL 中包含尺寸信息）
  const largeImage = images.find(img => {
    const sizeMatch = img.match(/_(\d+)\./);
    if (sizeMatch) {
      const size = parseInt(sizeMatch[1], 10);
      return size >= 1000;
    }
    return false;
  });
  if (largeImage) return largeImage;

  // 返回第一张
  return images[0];
}
