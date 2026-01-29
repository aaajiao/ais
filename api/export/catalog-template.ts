/**
 * PDF Catalog HTML 模板
 *
 * 生成用于 Puppeteer 渲染的 HTML 字符串
 * 设计参考：画廊 catalog 风格（Gagosian/White Cube）
 * 信息丰富 portfolio 排版 + Brutalist Minimalism 美学
 */

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
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
  font-family: "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Noto Sans SC", sans-serif;
  color: #1a1a1a;
  background: #ffffff;
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
  font-size: 32pt;
  font-weight: 300;
  letter-spacing: 0.02em;
  color: #1a1a1a;
  margin-bottom: 20mm;
}

.cover-location {
  font-size: 14pt;
  font-weight: 300;
  color: #4a4a4a;
  margin-bottom: 4mm;
}

.cover-subtitle {
  font-size: 11pt;
  font-weight: 300;
  color: #8a8a8a;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 3mm;
}

.cover-date {
  font-size: 10pt;
  font-weight: 300;
  color: #8a8a8a;
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
  font-weight: 300;
  color: #b0b0b0;
}

.cover-count {
  font-size: 8pt;
  font-weight: 300;
  color: #b0b0b0;
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
  font-size: 16pt;
  font-weight: 400;
  color: #1a1a1a;
  margin-bottom: 2mm;
  line-height: 1.2;
}

.artwork-title-cn {
  font-size: 12pt;
  font-weight: 300;
  color: #6a6a6a;
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
  font-size: 8pt;
  font-weight: 400;
  color: #8a8a8a;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding-top: 0.5mm;
}

.meta-value {
  font-size: 10pt;
  font-weight: 300;
  color: #4a4a4a;
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

.status-in_studio { background-color: #5a9a5a; }
.status-at_gallery { background-color: #9a8a3a; }
.status-at_museum { background-color: #7a5a9a; }
.status-in_transit { background-color: #5a7a9a; }
.status-in_production { background-color: #7a5a9a; }
.status-sold { background-color: #9a5a5a; }
.status-gifted { background-color: #9a8a3a; }
.status-lost, .status-damaged { background-color: #8a8a8a; }

/* Footer */
.artwork-footer {
  margin-top: auto;
  padding-top: 4mm;
  border-top: 0.5px solid #e5e5e5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-page {
  font-size: 8pt;
  font-weight: 300;
  color: #b0b0b0;
}

.footer-copyright {
  font-size: 8pt;
  font-weight: 300;
  color: #b0b0b0;
}
`;
}

function generateCoverPage(options: CatalogOptions, totalItems: number): string {
  const year = new Date().getFullYear();
  return `
<div class="page cover">
  <div class="cover-artist">aaajiao</div>
  <div class="cover-location">${escapeHtml(options.locationName)}</div>
  <div class="cover-subtitle">Selected Works</div>
  <div class="cover-date">${escapeHtml(options.date)}</div>
  <div class="cover-footer">
    <span class="cover-copyright">&copy; ${year} aaajiao studio</span>
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
    <div class="artwork-title-en">${escapeHtml(item.titleEn)}</div>
    ${titleCn}
    <div class="artwork-meta">
      ${metaRows.join('\n      ')}
    </div>
  </div>
  <div class="artwork-footer">
    <span class="footer-page">${pageNum}/${totalPages}</span>
    <span class="footer-copyright">&copy; ${year} aaajiao studio</span>
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
