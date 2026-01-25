// MD 文件解析器
// 用于解析从 eventstructure.com 导出的 Markdown 格式（新格式）
// 支持 **Field**: Value 格式和 HTML 图片链接

export interface ParsedArtwork {
  title_en: string;
  title_cn: string | null;
  year: string | null;
  type: string | null;
  dimensions: string | null;
  materials: string | null;
  duration: string | null;
  source_url: string | null;
  images: string[];
}

// 字段映射表（英文字段名 -> 数据库字段名）
const FIELD_MAP: Record<string, keyof Omit<ParsedArtwork, 'images' | 'title_en' | 'title_cn'>> = {
  'Year': 'year',
  'Type': 'type',
  'Size': 'dimensions',
  'Materials': 'materials',
  'Duration': 'duration',
  'URL': 'source_url',
  // 以下字段不导入：
  // 'Video' - 视频链接
  // 'Description' - 英文描述
  // '中文描述' - 中文描述
};

/**
 * 解析双语标题
 * 格式: "## English Title / 中文标题"
 */
function parseTitle(titleLine: string): { title_en: string; title_cn: string | null } {
  const match = titleLine.match(/^##\s+(.+)$/);
  if (!match) {
    return { title_en: '', title_cn: null };
  }

  const fullTitle = match[1].trim();

  // 检查是否有 " / " 分隔符（双语格式）
  if (fullTitle.includes(' / ')) {
    const parts = fullTitle.split(' / ');
    const titleEn = parts[0].trim();
    // 处理可能有多个 "/" 的情况，如 "Title / 标题 / 副标题"
    const titleCn = parts.slice(1).join(' / ').trim() || null;
    return { title_en: titleEn, title_cn: titleCn };
  }

  // 单语言标题
  return { title_en: fullTitle, title_cn: null };
}

/**
 * 解析 **Field**: Value 格式的字段
 */
function parseFieldValues(content: string): Map<string, string> {
  const fields = new Map<string, string>();

  // 匹配 **Field**: Value 格式
  // 支持多行值（直到下一个 **Field** 或 ### 或空行）
  const lines = content.split('\n');
  let currentField: string | null = null;
  let currentValue: string[] = [];

  for (const line of lines) {
    // 检查是否是新字段
    const fieldMatch = line.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);

    if (fieldMatch) {
      // 保存上一个字段
      if (currentField && currentValue.length > 0) {
        fields.set(currentField, currentValue.join(' ').trim());
      }

      currentField = fieldMatch[1].trim();
      const value = fieldMatch[2].trim();
      currentValue = value ? [value] : [];
    } else if (currentField && line.trim() && !line.startsWith('###') && !line.startsWith('---') && !line.startsWith('<')) {
      // 继续收集多行值（但不包括图片部分）
      currentValue.push(line.trim());
    } else if (line.startsWith('###') || line.startsWith('---') || line.startsWith('<')) {
      // 遇到新部分，保存当前字段
      if (currentField && currentValue.length > 0) {
        fields.set(currentField, currentValue.join(' ').trim());
      }
      currentField = null;
      currentValue = [];
    }
  }

  // 保存最后一个字段
  if (currentField && currentValue.length > 0) {
    fields.set(currentField, currentValue.join(' ').trim());
  }

  return fields;
}

/**
 * 从 HTML 和 Markdown 格式中提取图片 URL
 */
function extractImages(content: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  // 优先匹配: <a href="URL"><img ...></a>
  const aTagRegex = /<a\s+href="([^"]+)"[^>]*>\s*<img[^>]*>\s*<\/a>/gi;
  let match;
  while ((match = aTagRegex.exec(content)) !== null) {
    const url = match[1];
    if (url && url.startsWith('http') && !seen.has(url)) {
      images.push(url);
      seen.add(url);
    }
  }

  // 备选: 单独的 <img src="URL">
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  while ((match = imgRegex.exec(content)) !== null) {
    const url = match[1];
    if (url && url.startsWith('http') && !seen.has(url)) {
      images.push(url);
      seen.add(url);
    }
  }

  // 兼容: Markdown 格式 ![alt](url)
  const mdImageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  while ((match = mdImageRegex.exec(content)) !== null) {
    const url = match[1];
    if (url && url.startsWith('http') && !seen.has(url)) {
      images.push(url);
      seen.add(url);
    }
  }

  return images;
}

/**
 * 解析单个 MD 内容块（一个作品）
 */
export function parseMDBlock(content: string): ParsedArtwork | null {
  const result: ParsedArtwork = {
    title_en: '',
    title_cn: null,
    year: null,
    type: null,
    dimensions: null,
    materials: null,
    duration: null,
    source_url: null,
    images: [],
  };

  // 1. 解析标题（支持双语）
  const titleMatch = content.match(/^##\s+.+$/m);
  if (titleMatch) {
    const { title_en, title_cn } = parseTitle(titleMatch[0]);
    result.title_en = title_en;
    result.title_cn = title_cn;
  }

  // 2. 解析 **Field**: Value 格式的字段
  const fields = parseFieldValues(content);

  for (const [fieldName, value] of fields) {
    // 跳过不导入的字段
    if (fieldName === 'Video' || fieldName === 'Description' || fieldName === '中文描述') {
      continue;
    }

    if (fieldName in FIELD_MAP) {
      const key = FIELD_MAP[fieldName];
      result[key] = value || null;
    }
  }

  // 3. 提取图片（HTML 格式优先）
  result.images = extractImages(content);

  // 只有解析出标题才认为是有效的作品
  return result.title_en ? result : null;
}

/**
 * 解析完整 MD 文件（可能包含多个作品）
 */
export function parseMDFile(content: string): ParsedArtwork[] {
  // 按 ## 标题分割（保留分隔符）
  const blocks = content.split(/(?=^##\s)/m).filter(block => block.trim());

  return blocks
    .map(block => parseMDBlock(block))
    .filter((item): item is ParsedArtwork => item !== null);
}

/**
 * 验证解析结果
 */
export function validateParsedArtwork(artwork: ParsedArtwork): string[] {
  const warnings: string[] = [];

  if (!artwork.title_en) {
    warnings.push('缺少作品标题');
  }

  // source_url 对于增量更新很重要，但不是必须的
  if (!artwork.source_url) {
    warnings.push('缺少来源链接（无法进行增量更新匹配）');
  }

  return warnings;
}

/**
 * 解析并验证 MD 文件
 */
export function parseAndValidateMDFile(content: string): {
  artworks: ParsedArtwork[];
  warnings: Array<{ title: string; issues: string[] }>;
} {
  const artworks = parseMDFile(content);
  const warnings: Array<{ title: string; issues: string[] }> = [];

  for (const artwork of artworks) {
    const issues = validateParsedArtwork(artwork);
    if (issues.length > 0) {
      warnings.push({
        title: artwork.title_en || '未知作品',
        issues,
      });
    }
  }

  return { artworks, warnings };
}
