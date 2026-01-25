// Markdown 导出 API

import type { ExportRequest } from '../../src/lib/exporters/index.js';
import { generateFullMarkdown } from '../../src/lib/exporters/formatters.js';
import { getSupabaseClient, fetchArtworkExportData } from './shared.js';
import { verifyAuth, unauthorizedResponse } from '../lib/auth.js';

// Vercel API Handler
export default async function handler(req: Request): Promise<Response> {
  // 只允许 POST 请求
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

  try {
    const requestData: ExportRequest = await req.json();
    const { content, filename } = await handleMarkdownExport(requestData);

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 处理导出请求（内部函数）
export async function handleMarkdownExport(request: ExportRequest): Promise<{
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

  // 获取数据
  const artworksData = await fetchArtworkExportData(supabase, artworkIds);

  if (artworksData.length === 0) {
    throw new Error('No artworks found');
  }

  // 生成 Markdown
  const content = generateFullMarkdown(artworksData, request.options);

  // 生成文件名
  const dateStr = new Date().toISOString().split('T')[0];
  let filename: string;

  if (artworksData.length === 1) {
    // 单个作品：使用作品名
    const title = artworksData[0].artwork.title_en
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    filename = `aaajiao-${title}-${dateStr}.md`;
  } else {
    // 多个作品
    filename = `aaajiao-artworks-${dateStr}.md`;
  }

  return { content, filename };
}
