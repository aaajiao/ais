/**
 * 轻量 API 层 i18n 工具
 * 零依赖，简单字典查找 + {placeholder} 插值
 */

export type Locale = 'zh' | 'en';

const messages: Record<string, Record<Locale, string>> = {
  // === search-artworks ===
  'search.noResultsWithQuery': {
    zh: '没有找到与「{query}」相关的作品。数据库中可能还没有添加作品数据。',
    en: 'No artworks found matching "{query}". The database may not have any artwork data yet.',
  },
  'search.noResultsEmpty': {
    zh: '数据库中还没有任何作品数据。请先添加一些作品。',
    en: 'No artworks in the database yet. Please add some artworks first.',
  },
  'search.error': {
    zh: '搜索出错: {error}',
    en: 'Search error: {error}',
  },
  'search.noArtworksFound': {
    zh: '没有找到相关作品',
    en: 'No matching artworks found',
  },
  'search.artworksFound': {
    zh: '找到 {count} 件相关作品，结果已显示在界面上供用户查看和点击。',
    en: 'Found {count} matching artworks. Results are displayed on the interface for the user to browse.',
  },

  // === search-editions ===
  'editions.noResultsWithTerms': {
    zh: '没有找到符合条件的版本（搜索：{terms}）。数据库中可能还没有相关数据。',
    en: 'No matching editions found (search: {terms}). The database may not have relevant data yet.',
  },
  'editions.noResultsEmpty': {
    zh: '数据库中还没有任何版本数据。请先添加一些作品和版本。',
    en: 'No editions in the database yet. Please add some artworks and editions first.',
  },
  'editions.noMatch': {
    zh: '没有找到符合条件的版本',
    en: 'No matching editions found',
  },
  'editions.found': {
    zh: '找到 {count} 个符合条件的版本，结果已显示在界面上供用户查看和点击。',
    en: 'Found {count} matching editions. Results are displayed on the interface for the user to browse.',
  },

  // === search-locations ===
  'locations.noMatch': {
    zh: '没有找到相关位置',
    en: 'No matching locations found',
  },
  'locations.found': {
    zh: '找到 {count} 个相关位置，结果已显示在界面上。',
    en: 'Found {count} matching locations. Results are displayed on the interface.',
  },

  // === search-history ===
  'history.noEditionHistory': {
    zh: '没有找到作品「{title}」的版本历史记录',
    en: 'No edition history found for artwork "{title}"',
  },
  'history.noArtworkFound': {
    zh: '没有找到名为「{title}」的作品',
    en: 'No artwork found with the name "{title}"',
  },
  'history.noMatch': {
    zh: '没有找到匹配的历史记录',
    en: 'No matching history records found',
  },

  // === get-statistics ===
  'stats.empty': {
    zh: '数据库中还没有任何作品或版本数据。这是一个空的库存系统，请先添加一些作品数据。',
    en: 'No artworks or editions in the database yet. This is an empty inventory system. Please add some artwork data first.',
  },
  'stats.unknownLocation': {
    zh: '未知',
    en: 'Unknown',
  },

  // === update-confirmation ===
  'update.editionNotFound': {
    zh: '找不到该版本',
    en: 'Edition not found',
  },

  // === execute-update ===
  'update.notConfirmed': {
    zh: '用户未确认，操作取消',
    en: 'User did not confirm. Operation cancelled.',
  },
  'update.success': {
    zh: '更新成功',
    en: 'Update successful',
  },

  // === export-artworks ===
  'export.artworkNotFound': {
    zh: '找不到名为「{title}」的作品',
    en: 'No artwork found with the name "{title}"',
  },
  'export.multipleMatches': {
    zh: '找到 {count} 个匹配的作品，请指定具体的作品名称或使用作品 ID',
    en: 'Found {count} matching artworks. Please specify the exact artwork name or use artwork ID.',
  },
  'export.ready': {
    zh: '已准备好 {format} 导出，点击下方按钮下载',
    en: '{format} export is ready. Click the button below to download.',
  },

  // === import-from-url ===
  'import.extractFailed': {
    zh: '无法从页面提取作品信息',
    en: 'Unable to extract artwork information from the page',
  },
  'import.updateFailed': {
    zh: '更新作品失败: {error}',
    en: 'Failed to update artwork: {error}',
  },
  'import.createFailed': {
    zh: '创建作品失败: {error}',
    en: 'Failed to create artwork: {error}',
  },
  'import.created': {
    zh: '已创建作品「{title}」{thumbnail}',
    en: 'Created artwork "{title}"{thumbnail}',
  },
  'import.updated': {
    zh: '已更新作品「{title}」{thumbnail}',
    en: 'Updated artwork "{title}"{thumbnail}',
  },
  'import.withThumbnail': {
    zh: '，已获取缩略图',
    en: ', thumbnail acquired',
  },
  'import.unknownError': {
    zh: '未知错误',
    en: 'Unknown error',
  },

  // === artwork-extractor ===
  'extractor.timeout': {
    zh: '请求超时，请稍后重试',
    en: 'Request timed out. Please try again later.',
  },
  'extractor.noTitle': {
    zh: '无法从页面提取作品标题，请检查 URL 是否正确',
    en: 'Unable to extract artwork title from the page. Please check if the URL is correct.',
  },
  'extractor.failed': {
    zh: '提取失败: {error}',
    en: 'Extraction failed: {error}',
  },
  'extractor.unknownError': {
    zh: '未知错误',
    en: 'Unknown error',
  },

  // === view/[token] ===
  'view.invalidLink': {
    zh: '链接无效或已过期',
    en: 'Link is invalid or has expired',
  },
  'view.linkDisabled': {
    zh: '此链接已被禁用',
    en: 'This link has been disabled',
  },
  'view.locationNotFound': {
    zh: '关联的位置不存在',
    en: 'Associated location does not exist',
  },
};

/**
 * 创建翻译函数
 * 支持 {placeholder} 插值
 */
export function createT(locale: Locale = 'zh') {
  return function t(key: string, params?: Record<string, string | number>): string {
    const entry = messages[key];
    if (!entry) return key;

    let text = entry[locale] || entry['zh'];

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }

    return text;
  };
}
