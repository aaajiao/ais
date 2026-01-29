// 导出格式化工具

import type { ArtworkExportData, ExportOptions } from './index.js';
import {
  formatEditionInfo,
  formatPrice,
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
  options: ExportOptions,
  artistName?: string
): string {
  const name = artistName || 'aaajiao';
  const studio = `${name} studio`;
  const lines: string[] = [];

  // YAML Frontmatter
  const exportDate = new Date();
  lines.push('---');
  lines.push(`title: "${name} Artworks"`);
  lines.push(`exported_at: "${exportDate.toISOString()}"`);
  lines.push(`total_artworks: ${artworksData.length}`);
  lines.push(`include_price: ${options.includePrice}`);
  lines.push(`include_status: ${options.includeStatus}`);
  lines.push(`include_location: ${options.includeLocation}`);
  lines.push('---');
  lines.push('');

  // 文档头
  lines.push(`# ${name} Artworks`);
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
  lines.push(`© ${new Date().getFullYear()} ${studio}`);

  return lines.join('\n');
}

