// PDF 导出 API

import { jsPDF } from 'jspdf';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ExportRequest, ArtworkExportData } from '../../src/lib/exporters/index.js';
import { preparePDFData, type PDFArtworkData } from '../../src/lib/exporters/formatters.js';
import { getSupabaseClient, fetchArtworkExportData } from './shared.js';
import { verifyAuth } from '../lib/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel 配置：使用 Node.js runtime（需要文件系统访问）
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

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
    const { buffer, filename } = await handlePDFExport(requestData);

    // 设置响应头并发送二进制数据
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.byteLength);

    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('[PDF Export] Error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
}

// 获取当前目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载中文字体
let chineseFontLoaded = false;
let chineseFontBase64 = '';

function loadChineseFont(): string {
  if (chineseFontLoaded) return chineseFontBase64;

  try {
    // 字体文件在 api/fonts 目录下，当前文件在 api/export 目录下
    const fontPath = path.join(__dirname, '..', 'fonts', 'NotoSansSC-Regular.ttf');
    if (fs.existsSync(fontPath)) {
      const fontBuffer = fs.readFileSync(fontPath);
      chineseFontBase64 = fontBuffer.toString('base64');
      chineseFontLoaded = true;
      console.log('Chinese font loaded successfully from:', fontPath);
    } else {
      console.warn('Chinese font not found at:', fontPath);
    }
  } catch (error) {
    console.error('Failed to load Chinese font:', error);
  }

  return chineseFontBase64;
}

// 图片数据结构（包含尺寸信息和别名）
interface ImageData {
  base64: string;
  width: number;
  height: number;
  alias?: string;
}

// 图片缓存（用于避免重复嵌入相同图片）
interface CachedImage {
  data: ImageData;
  alias: string;
}

// 获取图片 base64 和尺寸（带超时）
async function fetchImageAsBase64(url: string, timeoutMs: number = 10000): Promise<ImageData | null> {
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

    // 解析图片尺寸
    const dimensions = getImageDimensions(buffer, contentType);

    return {
      base64: `data:${contentType};base64,${base64}`,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.error(`[PDF Export] Image fetch timeout: ${url}`);
    } else {
      console.error('[PDF Export] Failed to fetch image:', error);
    }
    return null;
  }
}

// 分批获取图片（限制并发数，避免内存问题）
async function fetchImagesInBatches(
  artworksData: ArtworkExportData[],
  batchSize: number = 5
): Promise<Map<string, CachedImage>> {
  const imageCache = new Map<string, CachedImage>();
  let aliasCounter = 0;

  // 收集所有需要获取的 URL（去重）
  const urlToArtworkMap = new Map<string, string[]>();
  for (const data of artworksData) {
    const url = data.artwork.thumbnail_url;
    if (url) {
      if (!urlToArtworkMap.has(url)) {
        urlToArtworkMap.set(url, []);
      }
      urlToArtworkMap.get(url)!.push(data.artwork.id);
    }
  }

  const uniqueUrls = Array.from(urlToArtworkMap.keys());

  // 分批获取
  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (url) => {
        try {
          const imageData = await fetchImageAsBase64(url);
          return { url, imageData };
        } catch (err) {
          console.error(`[PDF Export] Failed to fetch image: ${url}`, err);
          return { url, imageData: null };
        }
      })
    );

    // 存入缓存
    for (const { url, imageData } of batchResults) {
      if (imageData) {
        const alias = `img_${aliasCounter++}`;
        imageCache.set(url, {
          data: { ...imageData, alias },
          alias,
        });
      }
    }
  }

  return imageCache;
}

// 从图片 buffer 获取尺寸
function getImageDimensions(
  buffer: Buffer,
  contentType: string
): { width: number; height: number } {
  try {
    // PNG: 宽高在第 16-23 字节
    if (contentType.includes('png')) {
      if (buffer.length > 24) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
    }

    // JPEG: 需要解析 SOF 段
    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      let offset = 2; // 跳过 SOI 标记
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        // SOF0, SOF1, SOF2 标记
        if (marker >= 0xc0 && marker <= 0xc2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        // 跳到下一个段
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
    }

    // WebP: RIFF header 后的 VP8/VP8L/VP8X
    if (contentType.includes('webp')) {
      if (buffer.length > 30) {
        const fourCC = buffer.toString('ascii', 12, 16);
        if (fourCC === 'VP8 ') {
          // Lossy WebP
          const width = buffer.readUInt16LE(26) & 0x3fff;
          const height = buffer.readUInt16LE(28) & 0x3fff;
          return { width, height };
        } else if (fourCC === 'VP8L') {
          // Lossless WebP
          const bits = buffer.readUInt32LE(21);
          const width = (bits & 0x3fff) + 1;
          const height = ((bits >> 14) & 0x3fff) + 1;
          return { width, height };
        }
      }
    }
  } catch (error) {
    console.error('Failed to parse image dimensions:', error);
  }

  // 默认返回 1:1 比例
  return { width: 400, height: 400 };
}

// 检测文本是否包含中文
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

// 生成单个作品的 PDF 页面
async function addArtworkPage(
  doc: jsPDF,
  data: PDFArtworkData,
  imageData: ImageData | null,
  isFirstPage: boolean,
  hasChineseFont: boolean
) {
  if (!isFirstPage) {
    doc.addPage();
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;

  // 辅助函数：设置字体（根据内容自动选择）
  const setFontForText = (text: string, style: 'normal' | 'bold' = 'normal') => {
    if (hasChineseFont && containsChinese(text)) {
      doc.setFont('NotoSansSC', 'normal');
    } else {
      doc.setFont('helvetica', style);
    }
  };

  // 缩略图 - 保持宽高比，使用压缩和别名
  if (imageData) {
    try {
      const maxWidth = 80;
      const maxHeight = 80;

      // 计算保持宽高比的实际尺寸
      const aspectRatio = imageData.width / imageData.height;
      let imgWidth: number;
      let imgHeight: number;

      if (aspectRatio > 1) {
        // 横向图片
        imgWidth = maxWidth;
        imgHeight = maxWidth / aspectRatio;
      } else {
        // 纵向或正方形图片
        imgHeight = maxHeight;
        imgWidth = maxHeight * aspectRatio;
      }

      const imgX = (pageWidth - imgWidth) / 2;
      // 使用 MEDIUM 压缩和图片别名，避免重复嵌入
      doc.addImage(
        imageData.base64,
        'JPEG',
        imgX,
        y,
        imgWidth,
        imgHeight,
        imageData.alias, // 图片别名，相同别名不会重复嵌入
        'MEDIUM' // 压缩级别
      );
      y += imgHeight + 15;
    } catch (error) {
      console.error('Failed to add image to PDF:', error);
      y += 10;
    }
  }

  // 英文标题
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(data.titleEn, pageWidth - margin * 2);
  doc.text(titleLines, pageWidth / 2, y, { align: 'center' });
  y += titleLines.length * 8 + 5;

  // 中文标题（如果有中文字体支持）
  if (data.titleCn && hasChineseFont) {
    doc.setFontSize(14);
    doc.setFont('NotoSansSC', 'normal');
    doc.setTextColor(80, 80, 80);
    const cnLines = doc.splitTextToSize(data.titleCn, pageWidth - margin * 2);
    doc.text(cnLines, pageWidth / 2, y, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += cnLines.length * 6 + 5;
  }
  y += 5;

  // 基本信息
  doc.setFontSize(11);
  const leftX = margin + 10;

  const addInfoLine = (label: string, value: string | undefined) => {
    if (value) {
      // 标签用英文字体
      doc.setFont('helvetica', 'normal');
      const labelWidth = doc.getTextWidth(`${label}: `);
      doc.text(`${label}: `, leftX, y);

      // 值根据内容选择字体
      setFontForText(value);
      doc.text(value, leftX + labelWidth, y);
      y += 7;
    }
  };

  addInfoLine('Year', data.year);
  addInfoLine('Type', data.type);
  addInfoLine('Materials', data.materials);
  addInfoLine('Dimensions', data.dimensions);
  addInfoLine('Duration', data.duration);
  addInfoLine('Edition', data.editionInfo);

  y += 5;

  // 版本明细（新版格式）
  if (data.editionLines && data.editionLines.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('Edition Details:', leftX, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    for (const line of data.editionLines) {
      // 检查是否需要换页
      if (y > pageHeight - 40) {
        doc.addPage();
        y = margin;
      }

      setFontForText(line);
      // 使用圆点作为列表标记（与标题对齐）
      doc.text(`• ${line}`, leftX, y);
      y += 6;
    }
    y += 5;
  } else {
    // 旧版格式（无版本时）
    if (data.price) {
      addInfoLine('Price', data.price);
    }
    if (data.status) {
      addInfoLine('Status', data.status);
    }
    if (data.location) {
      addInfoLine('Location', data.location);
    }
  }

  y += 10;

  // 来源链接
  if (data.sourceUrl) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(data.sourceUrl, pageWidth / 2, y, { align: 'center' });
    y += 10;
  }

  // 版权信息（页面底部）
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(`© ${new Date().getFullYear()} aaajiao studio`, pageWidth / 2, pageHeight - margin, { align: 'center' });

  // 重置颜色
  doc.setTextColor(0, 0, 0);
}

// 生成 PDF
async function generatePDF(
  artworksData: ArtworkExportData[],
  options: ExportRequest['options']
): Promise<ArrayBuffer> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // 加载中文字体
  const fontBase64 = loadChineseFont();
  if (fontBase64) {
    doc.addFileToVFS('NotoSansSC-Regular.ttf', fontBase64);
    doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal');
  }

  // 分批获取图片（带缓存和别名）
  const imageCache = await fetchImagesInBatches(artworksData);

  // 检查是否有中文字体
  const hasChineseFont = !!fontBase64;

  // 生成每个作品的页面
  for (let i = 0; i < artworksData.length; i++) {
    const pdfData = preparePDFData(artworksData[i], options);
    const url = artworksData[i].artwork.thumbnail_url;
    const cachedImage = url ? imageCache.get(url) : undefined;
    const imageData = cachedImage ? cachedImage.data : null;

    await addArtworkPage(doc, pdfData, imageData, i === 0, hasChineseFont);
  }

  return doc.output('arraybuffer');
}

// 处理导出请求
export async function handlePDFExport(request: ExportRequest): Promise<{
  buffer: ArrayBuffer;
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

  // 获取数据（支持版本过滤）
  const artworksData = await fetchArtworkExportData(supabase, artworkIds, request.editionIds);

  if (artworksData.length === 0) {
    throw new Error('No artworks found');
  }

  // 生成 PDF（提供默认 options）
  const options = request.options ?? {
    includePrice: false,
    includeStatus: false,
    includeLocation: false,
  };
  const buffer = await generatePDF(artworksData, options);

  // 生成文件名
  const dateStr = new Date().toISOString().split('T')[0];
  let filename: string;

  if (artworksData.length === 1) {
    const title = artworksData[0].artwork.title_en
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    filename = `aaajiao-${title}-${dateStr}.pdf`;
  } else {
    filename = `aaajiao-artworks-${dateStr}.pdf`;
  }

  return { buffer, filename };
}
