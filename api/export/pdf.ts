/**
 * PDF Catalog 导出 API
 *
 * 使用 Puppeteer + @sparticuz/chromium-min 在 Vercel Functions 上
 * 渲染 HTML → PDF。支持两种入口：
 *
 * 1. 从 Link/token 维度（Public View 一键下载）
 *    POST { source: 'link', token: 'xxx' }
 *
 * 2. 从 Link 管理页维度（管理者选择性导出）
 *    POST { source: 'catalog', locationName: 'xxx', editionIds?: [...], options: { includePrice, includeStatus } }
 *
 * 3. 从 artwork 维度（兼容旧 Markdown 导出的 shared 数据流）
 *    POST { scope: 'single'|'selected', artworkIds: [...], format: 'pdf', options: {...} }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../lib/auth.js';
import { getSupabaseClient, fetchArtworkExportData } from './shared.js';
import { generateCatalogHTML, type CatalogItem, type CatalogOptions } from './catalog-template.js';
import type { ExportRequest } from '../../src/lib/exporters/index.js';
import {
  type EditionRow,
  buildCatalogItemFromEdition,
  buildCatalogItemFromArtworkData,
  generatePDFFilename,
  formatDate,
} from './pdf-helpers.js';

// Vercel 配置
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

// Catalog 请求类型
interface CatalogRequest {
  source: 'link' | 'catalog';
  // source: 'link' — 从 Public View 一键下载
  token?: string;
  // source: 'catalog' — 从 Links 管理页选择性导出
  locationName?: string;
  editionIds?: string[];
  options?: {
    includePrice: boolean;
    includeStatus: boolean;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // 判断请求类型
    if (body.source === 'link') {
      // Public View 一键下载 — 不需要认证
      return await handleLinkExport(body as CatalogRequest, res);
    } else if (body.source === 'catalog') {
      // Links 管理页选择性导出 — 需要认证
      const authResult = await verifyAuth(req);
      if (!authResult.success) {
        return res.status(401).json({ error: authResult.error || 'Unauthorized' });
      }
      return await handleCatalogExport(body as CatalogRequest, res);
    } else {
      // 兼容旧的 artwork 维度导出 — 需要认证
      const authResult = await verifyAuth(req);
      if (!authResult.success) {
        return res.status(401).json({ error: authResult.error || 'Unauthorized' });
      }
      return await handleLegacyExport(body as ExportRequest, res);
    }
  } catch (error) {
    console.error('[PDF Export] Error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
}

/**
 * 从 Public View 一键下载（通过 token）
 */
async function handleLinkExport(request: CatalogRequest, res: VercelResponse) {
  if (!request.token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  const supabase = getSupabaseClient();

  // 查找 link
  const { data: link, error: linkError } = await supabase
    .from('gallery_links')
    .select('*')
    .eq('token', request.token)
    .single();

  if (linkError || !link) {
    return res.status(404).json({ error: 'Link not found' });
  }

  if (link.status === 'disabled') {
    return res.status(403).json({ error: 'Link is disabled' });
  }

  // 查找位置
  const { data: location } = await supabase
    .from('locations')
    .select('id, name')
    .eq('name', link.gallery_name)
    .single();

  if (!location) {
    return res.status(404).json({ error: 'Location not found' });
  }

  // 获取该位置的所有 editions
  const { data: editions } = await supabase
    .from('editions')
    .select(`
      id,
      edition_type,
      edition_number,
      status,
      sale_price,
      sale_currency,
      artwork:artworks (
        id, title_en, title_cn, year, type, materials, dimensions, duration,
        thumbnail_url, source_url, edition_total, ap_total, is_unique
      )
    `)
    .eq('location_id', location.id);

  if (!editions || editions.length === 0) {
    return res.status(404).json({ error: 'No editions found at this location' });
  }

  const catalogOptions: CatalogOptions = {
    locationName: link.gallery_name,
    includePrice: link.show_prices,
    includeStatus: true,
    date: formatDate(),
  };

  const items = await buildCatalogItemsFromEditions(editions as unknown as EditionRow[], catalogOptions);
  return await generateAndSendPDF(items, catalogOptions, link.gallery_name, res);
}

/**
 * 从 Links 管理页选择性导出
 */
async function handleCatalogExport(request: CatalogRequest, res: VercelResponse) {
  if (!request.locationName) {
    return res.status(400).json({ error: 'locationName is required' });
  }

  const supabase = getSupabaseClient();

  // 查找位置
  const { data: location } = await supabase
    .from('locations')
    .select('id, name')
    .eq('name', request.locationName)
    .single();

  if (!location) {
    return res.status(404).json({ error: 'Location not found' });
  }

  // 获取 editions
  let editionsQuery = supabase
    .from('editions')
    .select(`
      id,
      edition_type,
      edition_number,
      status,
      sale_price,
      sale_currency,
      artwork:artworks (
        id, title_en, title_cn, year, type, materials, dimensions, duration,
        thumbnail_url, source_url, edition_total, ap_total, is_unique
      )
    `)
    .eq('location_id', location.id);

  // 如果指定了 editionIds，过滤
  if (request.editionIds && request.editionIds.length > 0) {
    editionsQuery = editionsQuery.in('id', request.editionIds);
  }

  const { data: editions } = await editionsQuery;

  if (!editions || editions.length === 0) {
    return res.status(404).json({ error: 'No editions found' });
  }

  const options = request.options || { includePrice: false, includeStatus: true };
  const catalogOptions: CatalogOptions = {
    locationName: request.locationName,
    includePrice: options.includePrice,
    includeStatus: options.includeStatus,
    date: formatDate(),
  };

  const items = await buildCatalogItemsFromEditions(editions as unknown as EditionRow[], catalogOptions);
  return await generateAndSendPDF(items, catalogOptions, request.locationName, res);
}

/**
 * 兼容旧的 artwork 维度导出
 */
async function handleLegacyExport(request: ExportRequest, res: VercelResponse) {
  const supabase = getSupabaseClient();

  let artworkIds: string[] | undefined;
  if (request.scope === 'single' || request.scope === 'selected') {
    if (!request.artworkIds || request.artworkIds.length === 0) {
      return res.status(400).json({ error: 'artworkIds is required' });
    }
    artworkIds = request.artworkIds;
  }

  const artworksData = await fetchArtworkExportData(supabase, artworkIds, request.editionIds);
  if (artworksData.length === 0) {
    return res.status(404).json({ error: 'No artworks found' });
  }

  const options = request.options ?? { includePrice: false, includeStatus: false, includeLocation: false };
  const catalogOptions: CatalogOptions = {
    locationName: 'aaajiao',
    includePrice: options.includePrice,
    includeStatus: options.includeStatus,
    date: formatDate(),
  };

  const items = await buildCatalogItemsFromArtworkData(artworksData, options);
  const locationLabel = artworksData.length === 1
    ? artworksData[0].artwork.title_en
    : 'Artworks';

  return await generateAndSendPDF(items, catalogOptions, locationLabel, res);
}

// --- Helper functions ---

/**
 * 从 edition 行数据构建 CatalogItem 列表
 */
async function buildCatalogItemsFromEditions(
  editions: EditionRow[],
  options: CatalogOptions
): Promise<CatalogItem[]> {
  // 预获取所有图片
  const validEditions = editions.filter(e => e.artwork != null);
  const imageUrls = [...new Set(validEditions.map(e => e.artwork!.thumbnail_url).filter(Boolean) as string[])];
  const imageCache = await fetchImagesInBatches(imageUrls);

  return validEditions
    .map(edition => buildCatalogItemFromEdition(edition, options, imageCache))
    .filter((item): item is CatalogItem => item !== null);
}

/**
 * 从 ArtworkExportData 构建 CatalogItem 列表（兼容旧流程）
 */
async function buildCatalogItemsFromArtworkData(
  artworksData: import('../../src/lib/exporters/index.js').ArtworkExportData[],
  options: import('../../src/lib/exporters/index.js').ExportOptions
): Promise<CatalogItem[]> {
  // 预获取所有图片
  const imageUrls = [...new Set(artworksData.map(d => d.artwork.thumbnail_url).filter(Boolean) as string[])];
  const imageCache = await fetchImagesInBatches(imageUrls);

  return artworksData.map(data => buildCatalogItemFromArtworkData(data, options, imageCache));
}

/**
 * 生成 PDF 并发送响应
 */
async function generateAndSendPDF(
  items: CatalogItem[],
  options: CatalogOptions,
  filenameLabel: string,
  res: VercelResponse
) {
  const html = generateCatalogHTML(items, options);
  const pdfBuffer = await renderHTMLToPDF(html);

  const filename = generatePDFFilename(filenameLabel);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.byteLength);

  return res.send(Buffer.from(pdfBuffer));
}

/**
 * 使用 Puppeteer 渲染 HTML → PDF
 */
async function renderHTMLToPDF(html: string): Promise<ArrayBuffer> {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  let browser;

  if (isProduction) {
    // Vercel: 使用 @sparticuz/chromium-min
    const chromium = await import('@sparticuz/chromium-min');
    const puppeteer = await import('puppeteer-core');

    const remoteExecutablePath =
      'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar';

    const executablePath = await chromium.default.executablePath(remoteExecutablePath);

    browser = await puppeteer.default.launch({
      executablePath,
      args: [
        ...chromium.default.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--font-render-hinting=none',
      ],
      headless: true,
      defaultViewport: chromium.default.defaultViewport,
    });
  } else {
    // 本地开发：使用系统 Chrome
    const puppeteer = await import('puppeteer-core');
    browser = await puppeteer.default.launch({
      headless: true,
      channel: 'chrome',
    });
  }

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });

    return pdfBuffer.buffer as ArrayBuffer;
  } finally {
    await browser.close();
  }
}

/**
 * 获取图片 base64（带超时）
 */
async function fetchImageAsBase64(url: string, timeoutMs: number = 10000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.error(`[PDF Export] Image fetch timeout: ${url}`);
    } else {
      console.error('[PDF Export] Failed to fetch image:', error);
    }
    return null;
  }
}

/**
 * 分批获取图片（限制并发）
 */
async function fetchImagesInBatches(
  urls: string[],
  batchSize: number = 5
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async url => {
        const base64 = await fetchImageAsBase64(url);
        return { url, base64 };
      })
    );

    for (const { url, base64 } of results) {
      if (base64) {
        cache.set(url, base64);
      }
    }
  }

  return cache;
}

// formatDate is imported from pdf-helpers.ts
