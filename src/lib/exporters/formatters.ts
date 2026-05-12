// 导出格式化工具 —— 统一 Markdown 布局

import type { ArtworkExportData, ExportOptions } from './index.js';
import {
  formatEditionInfo,
  formatEditionBlock,
  sortEditions,
} from './index.js';

// 生成单个作品的 Markdown
// 统一布局：H1 标题 + thumbnail + ## Artwork bullet 字段 + ## Editions 列表
export function generateArtworkMarkdown(
  data: ArtworkExportData,
  options: ExportOptions
): string {
  const { artwork, editions, locations, filesByEdition, historyByEdition } = data;
  const lines: string[] = [];

  // 标题
  lines.push(`# ${artwork.title_en}`);
  if (artwork.title_cn) {
    lines.push(artwork.title_cn);
  }
  lines.push('');

  // 缩略图
  if (artwork.thumbnail_url) {
    lines.push(`<img src="${artwork.thumbnail_url}" alt="${artwork.title_en}" />`);
    lines.push('');
  }

  // Artwork 字段块
  lines.push('## Artwork');
  lines.push('');
  if (artwork.year) {
    lines.push(`- **Year**: ${artwork.year}`);
  }
  if (artwork.type) {
    lines.push(`- **Type**: ${artwork.type}`);
  }
  if (artwork.materials) {
    lines.push(`- **Materials**: ${artwork.materials}`);
  }
  if (artwork.dimensions) {
    lines.push(`- **Dimensions**: ${artwork.dimensions}`);
  }
  if (artwork.duration) {
    lines.push(`- **Duration**: ${artwork.duration}`);
  }
  lines.push(`- **Edition**: ${formatEditionInfo(artwork)}`);
  if (options.includeDetails && artwork.notes) {
    lines.push(`- **Notes**: ${artwork.notes}`);
  }
  if (artwork.source_url) {
    lines.push(`- **Source**: <${artwork.source_url}>`);
  }
  lines.push('');

  // Editions 列表
  if (editions.length > 0) {
    lines.push('## Editions');
    lines.push('');
    const sorted = sortEditions(editions);
    for (const edition of sorted) {
      const files = filesByEdition.get(edition.id);
      const history = historyByEdition?.get(edition.id);
      const block = formatEditionBlock(edition, artwork, locations, files, history, options, 'en');
      lines.push(...block);
    }
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
  // 是否包含历史信息：所有 ArtworkExportData 必须一致；以第一个为准
  const includeHistory = artworksData.length > 0
    ? artworksData[0].historyByEdition !== undefined
    : false;
  lines.push('---');
  lines.push(`title: "${name} Artworks"`);
  lines.push(`exported_at: "${exportDate.toISOString()}"`);
  lines.push(`total_artworks: ${artworksData.length}`);
  lines.push(`include_price: ${options.includePrice}`);
  lines.push(`include_status: ${options.includeStatus}`);
  lines.push(`include_location: ${options.includeLocation}`);
  lines.push(`include_details: ${options.includeDetails}`);
  lines.push(`include_files: ${options.includeFiles}`);
  lines.push(`include_history: ${includeHistory}`);
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
