// 导出格式化工具

import type { ArtworkExportData, ExportOptions } from './index.js';
import {
  formatEditionInfo,
  formatPrice,
  formatStatusStats,
  getLocationNames,
  formatEditionLines,
} from './index.js';

// 生成单个作品的 Markdown
export function generateArtworkMarkdown(
  data: ArtworkExportData,
  options: ExportOptions
): string {
  const { artwork, priceInfo, editions, locations } = data;
  const lines: string[] = [];

  // 标题
  lines.push(`# ${artwork.title_en}`);
  if (artwork.title_cn) {
    lines.push(artwork.title_cn);
  }
  lines.push('');

  // 缩略图
  if (artwork.thumbnail_url) {
    lines.push(`![${artwork.title_en}](${artwork.thumbnail_url})`);
    lines.push('');
  }

  // 基础信息 - 使用英文标签
  if (artwork.year) {
    lines.push(`**Year**: ${artwork.year}`);
  }
  if (artwork.type) {
    lines.push(`**Type**: ${artwork.type}`);
  }
  if (artwork.materials) {
    lines.push(`**Materials**: ${artwork.materials}`);
  }
  if (artwork.dimensions) {
    lines.push(`**Dimensions**: ${artwork.dimensions}`);
  }
  if (artwork.duration) {
    lines.push(`**Duration**: ${artwork.duration}`);
  }

  // 版本信息
  const editionInfo = formatEditionInfo(artwork);
  lines.push(`**Edition**: ${editionInfo}`);

  // 版本明细（如果有任何可选信息启用）
  if (options.includeStatus || options.includeLocation || options.includePrice) {
    if (editions.length > 0) {
      lines.push('');
      lines.push('**Edition Details**:');
      const editionLines = formatEditionLines(editions, artwork, locations, options, 'en');
      editionLines.forEach(line => {
        lines.push(`- ${line}`);
      });
    } else {
      // 无版本时的简化显示
      if (options.includePrice) {
        if (priceInfo) {
          lines.push(`**Price**: ${formatPrice(priceInfo.price, priceInfo.currency)}`);
        } else {
          lines.push(`**Price**: Price on request`);
        }
      }
      if (options.includeStatus) {
        lines.push(`**Status**: No editions`);
      }
      if (options.includeLocation) {
        lines.push(`**Location**: -`);
      }
    }
  }

  lines.push('');

  // 来源链接
  if (artwork.source_url) {
    lines.push(`[View Details](${artwork.source_url})`);
    lines.push('');
  }

  // 分隔线
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

// 生成完整 Markdown 文档
export function generateFullMarkdown(
  artworksData: ArtworkExportData[],
  options: ExportOptions
): string {
  const lines: string[] = [];

  // YAML Frontmatter
  const exportDate = new Date();
  lines.push('---');
  lines.push('title: "aaajiao Artworks"');
  lines.push(`exported_at: "${exportDate.toISOString()}"`);
  lines.push(`total_artworks: ${artworksData.length}`);
  lines.push(`include_price: ${options.includePrice}`);
  lines.push(`include_status: ${options.includeStatus}`);
  lines.push(`include_location: ${options.includeLocation}`);
  lines.push('---');
  lines.push('');

  // 文档头
  lines.push('# aaajiao Artworks');
  lines.push('');
  lines.push(`Exported: ${exportDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 每个作品
  for (const data of artworksData) {
    lines.push(generateArtworkMarkdown(data, options));
  }

  // 版权信息
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('© aaajiao studio');

  return lines.join('\n');
}

// PDF 文本数据结构
export interface PDFArtworkData {
  titleEn: string;
  titleCn?: string;
  year?: string;
  type?: string;
  materials?: string;
  dimensions?: string;
  duration?: string;
  editionInfo: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  // 可选字段（旧版汇总格式，保留向后兼容）
  price?: string;
  status?: string;
  location?: string;
  // 新版版本明细行
  editionLines?: string[];
}

// 准备 PDF 导出数据
export function preparePDFData(
  data: ArtworkExportData,
  options: ExportOptions
): PDFArtworkData {
  const { artwork, stats, priceInfo, editions, locations } = data;

  const pdfData: PDFArtworkData = {
    titleEn: artwork.title_en,
    titleCn: artwork.title_cn || undefined,
    year: artwork.year || undefined,
    type: artwork.type || undefined,
    materials: artwork.materials || undefined,
    dimensions: artwork.dimensions || undefined,
    duration: artwork.duration || undefined,
    editionInfo: formatEditionInfo(artwork),
    thumbnailUrl: artwork.thumbnail_url || undefined,
    sourceUrl: artwork.source_url || undefined,
  };

  // 版本明细（如果有任何可选信息启用且有版本）
  if ((options.includeStatus || options.includeLocation || options.includePrice) && editions.length > 0) {
    pdfData.editionLines = formatEditionLines(editions, artwork, locations, options, 'en');
  } else {
    // 无版本时的简化显示（保持旧格式向后兼容）
    // 可选：价格
    if (options.includePrice) {
      if (priceInfo) {
        pdfData.price = formatPrice(priceInfo.price, priceInfo.currency);
      } else {
        pdfData.price = 'Price on request';
      }
    }

    // 可选：状态
    if (options.includeStatus) {
      if (stats.total > 0) {
        pdfData.status = formatStatusStats(stats, 'en');
      } else {
        pdfData.status = 'No editions';
      }
    }

    // 可选：位置
    if (options.includeLocation) {
      const locationNames = getLocationNames(editions, locations);
      if (locationNames.length > 0) {
        pdfData.location = locationNames.join(', ');
      } else {
        pdfData.location = '-';
      }
    }
  }

  return pdfData;
}
