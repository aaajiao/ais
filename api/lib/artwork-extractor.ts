/**
 * Artwork Extractor - 使用 LLM 从网页 HTML 中提取作品信息
 */

import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// 默认提取模型（使用别名）
const DEFAULT_EXTRACTION_MODEL = 'claude-sonnet-4-5';

/**
 * 根据模型 ID 获取对应的 provider 实例
 */
function getModel(modelId?: string) {
  const id = modelId || DEFAULT_EXTRACTION_MODEL;

  if (id.startsWith('claude-')) {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: 'https://api.anthropic.com/v1',
    });
    return anthropic(id);
  } else if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    return openai(id);
  }

  // 默认使用 Anthropic
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: 'https://api.anthropic.com/v1',
  });
  return anthropic(id);
}

// 作品信息 Schema
export const artworkSchema = z.object({
  title_en: z.string().describe('英文标题'),
  title_cn: z.string().nullable().describe('中文标题，如果有的话'),
  year: z.string().nullable().describe('年份，如 2024 或 2024-2025'),
  type: z.string().nullable().describe('作品类型，如 Installation, Video, Sculpture'),
  dimensions: z.string().nullable().describe('尺寸，如 75 x 75 x 140 cm'),
  materials: z.string().nullable().describe('材料，如 silicone, fiberglass'),
  duration: z.string().nullable().describe('视频时长，如 12′00″'),
  description_en: z.string().nullable().describe('英文描述，简短摘要即可'),
  description_cn: z.string().nullable().describe('中文描述，简短摘要即可'),
});

export type ExtractedArtwork = z.infer<typeof artworkSchema>;

export interface ExtractionResult {
  success: boolean;
  artwork?: ExtractedArtwork;
  images: string[];
  error?: string;
}

/**
 * 从 HTML 中提取所有图片 URL
 */
export function extractImageUrls(html: string): string[] {
  const images: string[] = [];

  // 匹配 <img> 标签的 src 属性
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    // 过滤有效的图片 URL
    if (
      src.startsWith('http') &&
      !src.includes('icon') &&
      !src.includes('logo') &&
      !src.includes('favicon') &&
      !src.includes('avatar') &&
      !src.includes('spinner') &&
      !src.includes('loading')
    ) {
      images.push(src);
    }
  }

  // 匹配 CSS background-image
  const bgRegex = /background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http')) {
      images.push(src);
    }
  }

  // 匹配 data-src (懒加载)
  const dataSrcRegex = /data-src=["']([^"']+)["']/gi;
  while ((match = dataSrcRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http')) {
      images.push(src);
    }
  }

  // 去重并返回
  return [...new Set(images)];
}

/**
 * 清理 HTML，移除脚本和样式，减少 token 消耗
 */
export function cleanHtml(html: string): string {
  return html
    // 移除 script 标签
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // 移除 style 标签
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // 移除 HTML 注释
    .replace(/<!--[\s\S]*?-->/g, '')
    // 移除 SVG
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    // 压缩空白
    .replace(/\s+/g, ' ')
    // 限制长度（避免 token 超限）
    .slice(0, 50000);
}

/**
 * 抓取网页内容
 */
async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    throw error;
  }
}

/**
 * 使用 LLM 从 HTML 提取作品信息
 * @param url - 要提取的网页 URL
 * @param modelId - 可选的模型 ID，支持 Anthropic (claude-*) 和 OpenAI (gpt-*, o1, o3, o4) 模型
 */
export async function extractArtworkFromUrl(url: string, modelId?: string): Promise<ExtractionResult> {
  try {
    // 1. 抓取页面
    const html = await fetchPage(url);

    // 2. 提取图片 URL（在清理 HTML 之前）
    const images = extractImageUrls(html);

    // 3. 清理 HTML
    const cleanedHtml = cleanHtml(html);

    // 4. 使用 LLM 提取结构化数据
    const { object } = await generateObject({
      model: getModel(modelId),
      schema: artworkSchema,
      system: `你是一个艺术作品信息提取专家。从给定的网页 HTML 内容中提取作品信息。

提取规则：
1. 标题：可能是 "English Title / 中文标题" 格式，需要分别提取到 title_en 和 title_cn
2. 年份：可能是单年（2024）或范围（2024-2025）
3. 类型：如 Installation, Video, Sculpture, Photography, Print 等
4. 尺寸：通常格式为 "宽 x 高 x 深 cm" 或 "宽 x 高 cm"
5. 材料：可能是英文或中文，提取原始描述
6. 时长：仅视频作品有，格式如 12'00" 或 10′42″
7. 描述：提取简短摘要，不超过 200 字

如果找不到某个字段，返回 null。不要猜测或编造信息。`,
      prompt: `请从以下网页内容中提取作品信息：

URL: ${url}

HTML 内容:
${cleanedHtml}`,
    });

    // 5. 验证必要字段
    if (!object.title_en || object.title_en.trim() === '') {
      return {
        success: false,
        images,
        error: '无法从页面提取作品标题，请检查 URL 是否正确',
      };
    }

    return {
      success: true,
      artwork: object,
      images,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return {
      success: false,
      images: [],
      error: `提取失败: ${message}`,
    };
  }
}
