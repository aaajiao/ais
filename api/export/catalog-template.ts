/**
 * PDF Catalog HTML 模板
 *
 * 生成用于 Puppeteer 渲染的 HTML 字符串
 * 设计参考：画廊 catalog 风格（Gagosian/White Cube）
 * 信息丰富 portfolio 排版 + Brutalist Minimalism 美学
 */

import { getInlineFontCSS } from './font-loader.js';

// 与 src/index.css CSS 变量保持同步（亮色模式）
const PDF_THEME = {
  // 基础色
  background: 'oklch(0.85 0.012 265)',       // --background
  foreground: 'oklch(0.20 0.005 265)',        // --foreground
  muted: 'oklch(0.40 0.005 265)',             // --muted-foreground
  subtle: 'oklch(0.55 0.02 265)',             // 辅助文字
  border: 'oklch(0.77 0.011 265)',            // --border
  // 状态色
  statusAvailable: 'oklch(0.52 0.12 145)',    // --status-available (in_studio)
  statusConsigned: 'oklch(0.60 0.12 85)',     // --status-consigned (at_gallery, gifted)
  statusMuseum: 'oklch(0.52 0.12 310)',       // --status-museum (at_museum)
  statusSold: 'oklch(0.52 0.14 25)',          // --status-sold
  statusTransit: 'oklch(0.52 0.12 250)',      // --status-transit
  statusInactive: 'oklch(0.55 0.02 265)',     // --status-inactive (lost, damaged)
  statusProduction: 'oklch(0.52 0.12 290)',   // --status-production
  // 字体
  fontBody: "'IBM Plex Sans', 'Noto Sans SC', system-ui, sans-serif",
  fontDisplay: "'Space Mono', Menlo, monospace",
};

// 单个作品的 catalog 数据
export interface CatalogItem {
  titleEn: string;
  titleCn?: string;
  year?: string;
  type?: string;
  materials?: string;
  dimensions?: string;
  duration?: string;
  editionLabel: string;       // e.g. "2/5", "AP 1", "Unique"
  editionInfo: string;        // e.g. "Edition of 5 + 2AP"
  status?: string;            // e.g. "In Studio", "Sold"
  price?: string;             // e.g. "¥50,000"
  thumbnailBase64?: string;   // data:image/...;base64,...
  sourceUrl?: string;
}

// Catalog 生成选项
export interface CatalogOptions {
  locationName: string;
  includePrice: boolean;
  includeStatus: boolean;
  date: string;               // e.g. "January 29, 2026"
  artistName?: string;        // e.g. "aaajiao" — defaults to "aaajiao"
}

/**
 * 生成完整的 catalog HTML 字符串
 */
export function generateCatalogHTML(
  items: CatalogItem[],
  options: CatalogOptions
): string {
  const coverPage = generateCoverPage(options, items.length);
  const artworkPages = items.map((item, index) =>
    generateArtworkPage(item, options, index + 1, items.length)
  ).join('');

  // 仅当包含中文标题时加载 Noto Sans SC
  const hasChinese = items.some(item => item.titleCn);
  const chineseFontLink = hasChinese
    ? '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500&display=swap" rel="stylesheet">'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
${chineseFontLink}
<style>
${getInlineFontCSS()}
${getCatalogCSS()}
</style>
</head>
<body>
${coverPage}
${artworkPages}
</body>
</html>`;
}

function getCatalogCSS(): string {
  return `
/* Reset & Base */
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

@page {
  size: A4;
  margin: 0;
}

body {
  font-family: ${PDF_THEME.fontBody};
  color: ${PDF_THEME.foreground};
  background: ${PDF_THEME.background};
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Page Layout */
.page {
  width: 210mm;
  height: 297mm;
  position: relative;
  page-break-after: always;
  overflow: hidden;
}

.page:last-child {
  page-break-after: auto;
}

/* Cover Page */
.cover {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 40mm 30mm;
  height: 100%;
}

.cover-artist {
  font-family: ${PDF_THEME.fontDisplay};
  font-size: 32pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: ${PDF_THEME.foreground};
  margin-bottom: 20mm;
}

.cover-location {
  font-size: 14pt;
  font-weight: 400;
  color: ${PDF_THEME.muted};
  margin-bottom: 4mm;
}

.cover-subtitle {
  font-family: ${PDF_THEME.fontDisplay};
  font-size: 11pt;
  font-weight: 400;
  color: ${PDF_THEME.subtle};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 3mm;
}

.cover-date {
  font-size: 10pt;
  font-weight: 400;
  color: ${PDF_THEME.subtle};
}

.cover-footer {
  position: absolute;
  bottom: 25mm;
  left: 30mm;
  right: 30mm;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.cover-copyright {
  font-size: 8pt;
  font-weight: 400;
  color: ${PDF_THEME.subtle};
}

.cover-count {
  font-family: ${PDF_THEME.fontDisplay};
  font-size: 8pt;
  font-weight: 400;
  color: ${PDF_THEME.subtle};
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Artwork Page */
.artwork-page {
  padding: 20mm 15mm 25mm 15mm;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Image Area */
.artwork-image-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  margin-bottom: 10mm;
}

.artwork-image {
  max-width: 100%;
  max-height: 160mm;
  object-fit: contain;
  display: block;
}

/* Info Area */
.artwork-info {
  flex-shrink: 0;
}

.artwork-title-en {
  font-family: ${PDF_THEME.fontDisplay};
  font-size: 16pt;
  font-weight: 700;
  color: ${PDF_THEME.foreground};
  margin-bottom: 2mm;
  line-height: 1.2;
}

.title-link {
  display: inline-block;
  margin-left: 4px;
  vertical-align: baseline;
  text-decoration: none;
  color: ${PDF_THEME.subtle};
  position: relative;
  top: 1px;
}

.title-link svg {
  width: 12px;
  height: 12px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.artwork-title-cn {
  font-size: 12pt;
  font-weight: 400;
  color: ${PDF_THEME.muted};
  margin-bottom: 6mm;
  line-height: 1.3;
}

/* Metadata Grid */
.artwork-meta {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 2mm 4mm;
  margin-bottom: 4mm;
}

.meta-label {
  font-family: ${PDF_THEME.fontDisplay};
  font-size: 8pt;
  font-weight: 400;
  color: ${PDF_THEME.subtle};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding-top: 0.5mm;
}

.meta-value {
  font-size: 10pt;
  font-weight: 400;
  color: ${PDF_THEME.muted};
  line-height: 1.4;
}

/* Status indicator */
.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
  position: relative;
  top: -1px;
}

.status-in_studio { background-color: ${PDF_THEME.statusAvailable}; }
.status-at_gallery { background-color: ${PDF_THEME.statusConsigned}; }
.status-at_museum { background-color: ${PDF_THEME.statusMuseum}; }
.status-in_transit { background-color: ${PDF_THEME.statusTransit}; }
.status-in_production { background-color: ${PDF_THEME.statusProduction}; }
.status-sold { background-color: ${PDF_THEME.statusSold}; }
.status-gifted { background-color: ${PDF_THEME.statusConsigned}; }
.status-lost, .status-damaged { background-color: ${PDF_THEME.statusInactive}; }

/* Footer */
.artwork-footer {
  margin-top: auto;
  padding-top: 4mm;
  border-top: 0.5px solid ${PDF_THEME.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-page {
  font-family: ${PDF_THEME.fontDisplay};
  font-size: 8pt;
  font-weight: 400;
  color: ${PDF_THEME.subtle};
}

.footer-copyright {
  font-size: 8pt;
  font-weight: 400;
  color: ${PDF_THEME.subtle};
}
`;
}

function generateCoverPage(options: CatalogOptions, totalItems: number): string {
  const year = new Date().getFullYear();
  const artist = options.artistName || 'aaajiao';
  const studio = `${artist} studio`;
  return `
<div class="page cover">
  <div class="cover-artist">${escapeHtml(artist)}</div>
  <div class="cover-location">${escapeHtml(options.locationName)}</div>
  <div class="cover-subtitle">Selected Works</div>
  <div class="cover-date">${escapeHtml(options.date)}</div>
  <div class="cover-footer">
    <span class="cover-copyright">&copy; ${year} ${escapeHtml(studio)}</span>
    <span class="cover-count">${totalItems} works</span>
  </div>
</div>`;
}

function generateArtworkPage(
  item: CatalogItem,
  options: CatalogOptions,
  pageNum: number,
  totalPages: number
): string {
  const year = new Date().getFullYear();
  const studio = `${options.artistName || 'aaajiao'} studio`;

  // Build image section
  const imageSection = item.thumbnailBase64
    ? `<div class="artwork-image-container">
        <img class="artwork-image" src="${item.thumbnailBase64}" alt="${escapeHtml(item.titleEn)}" />
      </div>`
    : `<div class="artwork-image-container"></div>`;

  // Build title section
  const titleCn = item.titleCn
    ? `<div class="artwork-title-cn">${escapeHtml(item.titleCn)}</div>`
    : '';

  // Build metadata rows (only show fields that have values)
  const metaRows: string[] = [];

  if (item.year) {
    metaRows.push(metaRow('Year', item.year));
  }
  if (item.type) {
    metaRows.push(metaRow('Type', item.type));
  }
  if (item.materials) {
    metaRows.push(metaRow('Materials', item.materials));
  }
  if (item.dimensions) {
    metaRows.push(metaRow('Dimensions', item.dimensions));
  }
  if (item.duration) {
    metaRows.push(metaRow('Duration', item.duration));
  }

  // Edition info
  metaRows.push(metaRow('Edition', item.editionLabel || item.editionInfo));

  // Optional: status with color dot
  if (options.includeStatus && item.status) {
    const statusKey = statusToKey(item.status);
    const statusHtml = `<span class="status-dot status-${statusKey}"></span>${escapeHtml(item.status)}`;
    metaRows.push(`<div class="meta-label">Status</div><div class="meta-value">${statusHtml}</div>`);
  }

  // Optional: price
  if (options.includePrice && item.price) {
    metaRows.push(metaRow('Price', item.price));
  }

  return `
<div class="page artwork-page">
  ${imageSection}
  <div class="artwork-info">
    <div class="artwork-title-en">${escapeHtml(item.titleEn)}${item.sourceUrl ? ` <a class="title-link" href="${escapeHtml(item.sourceUrl)}" target="_blank"><svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ''}</div>
    ${titleCn}
    <div class="artwork-meta">
      ${metaRows.join('\n      ')}
    </div>
  </div>
  <div class="artwork-footer">
    <span class="footer-page">${pageNum}/${totalPages}</span>
    <span class="footer-copyright">&copy; ${year} ${escapeHtml(studio)}</span>
  </div>
</div>`;
}

function metaRow(label: string, value: string): string {
  return `<div class="meta-label">${escapeHtml(label)}</div><div class="meta-value">${escapeHtml(value)}</div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Map display status text back to CSS class key
function statusToKey(status: string): string {
  const map: Record<string, string> = {
    'In Production': 'in_production',
    'In Studio': 'in_studio',
    'On Loan': 'at_gallery',
    'On Exhibition': 'at_museum',
    'In Transit': 'in_transit',
    'Sold': 'sold',
    'Gifted': 'gifted',
    'Lost': 'lost',
    'Damaged': 'damaged',
  };
  return map[status] || 'in_studio';
}
