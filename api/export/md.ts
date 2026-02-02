// Markdown 导出 API

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ExportRequest } from '../../src/lib/exporters/index.js';
import { generateFullMarkdown } from '../../src/lib/exporters/formatters.js';
import { getSupabaseClient, fetchArtworkExportData } from './shared.js';
import { verifyAuth } from '../lib/auth.js';

// Vercel API Handler (Node.js runtime with VercelRequest/VercelResponse)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 认证检查
  const authResult = await verifyAuth(req);
  if (!authResult.success) {
    return res.status(401).json({ error: authResult.error || 'Unauthorized' });
  }

  try {
    const requestData = req.body as ExportRequest;
    const { content, filename } = await handleMarkdownExport(requestData, authResult.userId!);

    // 设置响应头并发送文本内容
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.send(content);
  } catch (error) {
    console.error('[MD Export] Error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
}

// 处理导出请求（内部函数）
export async function handleMarkdownExport(request: ExportRequest, userId?: string): Promise<{
  content: string;
  filename: string;
}> {
  const supabase = getSupabaseClient();

  // 根据 scope 确定作品 IDs
  let artworkIds: string[] | undefined;

  if (request.scope === 'single' || request.scope === 'selected') {
    if (!request.artworkIds || request.artworkIds.length === 0) {
      throw new Error('artworkIds is required for single/selected scope');
    }
    artworkIds = request.artworkIds;
  }
  // scope === 'all' 时不传 artworkIds，获取全部

  // 获取数据（支持版本过滤，限定用户）
  const artworksData = await fetchArtworkExportData(supabase, artworkIds, request.editionIds, userId);

  if (artworksData.length === 0) {
    throw new Error('No artworks found');
  }

  // 生成 Markdown（提供默认 options）
  const options = request.options ?? {
    includePrice: false,
    includeStatus: false,
    includeLocation: false,
    includeDetails: false,
  };
  const artistName = request.artistName || 'aaajiao';
  const content = generateFullMarkdown(artworksData, options, artistName);

  // 生成文件名
  const dateStr = new Date().toISOString().split('T')[0];
  let filename: string;

  if (artworksData.length === 1) {
    // 单个作品：使用作品名
    const title = artworksData[0].artwork.title_en
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    filename = `${artistName}-${title}-${dateStr}.md`;
  } else {
    // 多个作品
    filename = `${artistName}-artworks-${dateStr}.md`;
  }

  return { content, filename };
}
