// 图片处理 API - 下载外部图片、压缩并上传到 Supabase Storage

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import sharp from 'sharp';
import { verifyAuth } from '../lib/auth.js';

// Vercel 配置：使用 Node.js runtime
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

interface ProcessImageRequest {
  url: string;
  artworkId: string;
}

interface ProcessImageResponse {
  success: boolean;
  publicUrl?: string;
  originalSize?: number;
  compressedSize?: number;
  error?: string;
}

// 检查是否已经是 Supabase Storage URL
export function isSupabaseUrl(url: string): boolean {
  return url.includes('supabase.co/storage') || url.startsWith('thumbnails/');
}

// 下载外部图片（带超时）
async function fetchImage(url: string, timeoutMs: number = 15000): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArtworkImporter/1.0)',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new Error('Image fetch timeout');
    }
    throw error;
  }
}

// 压缩图片
async function compressImage(inputBuffer: Buffer): Promise<{ buffer: Buffer; info: sharp.OutputInfo }> {
  const image = sharp(inputBuffer);

  // 获取原始图片信息
  const metadata = await image.metadata();

  // 压缩处理
  const processedBuffer = await image
    .resize(1200, 1200, {
      fit: 'inside',           // 保持比例，不超过最大尺寸
      withoutEnlargement: true // 小图不放大
    })
    .jpeg({
      quality: 80,
      mozjpeg: true            // 更好的压缩率
    })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: processedBuffer.data,
    info: processedBuffer.info,
  };
}

// Supabase 客户端类型（简化以避免泛型问题）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = ReturnType<typeof createClient<any>>;

// 处理单个图片
export async function processExternalImage(
  url: string,
  artworkId: string,
  supabase: SupabaseClientType
): Promise<ProcessImageResponse> {
  // 跳过已经是 Supabase URL 的图片
  if (isSupabaseUrl(url)) {
    return { success: true, publicUrl: url };
  }

  try {
    // 1. 下载图片
    const originalBuffer = await fetchImage(url);
    const originalSize = originalBuffer.length;

    // 2. 压缩图片
    const { buffer: compressedBuffer, info } = await compressImage(originalBuffer);
    const compressedSize = compressedBuffer.length;

    // 3. 生成文件路径
    const uuid = crypto.randomUUID();
    const filePath = `${artworkId}/${uuid}.jpg`;

    // 4. 上传到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(filePath, compressedBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // 5. 获取公开 URL
    const { data: publicUrlData } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(filePath);

    return {
      success: true,
      publicUrl: publicUrlData.publicUrl,
      originalSize,
      compressedSize,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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
    const body: ProcessImageRequest = req.body;

    if (!body.url || !body.artworkId) {
      return res.status(400).json({ success: false, error: 'Missing url or artworkId' });
    }

    const result = await processExternalImage(body.url, body.artworkId, supabase);

    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    console.error('Process image API error:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Process failed' });
  }
}
