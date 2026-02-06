import type { ToolContext } from './types.js';
import { createSearchArtworksTool } from './search-artworks.js';
import { createSearchEditionsTool } from './search-editions.js';
import { createSearchLocationsTool } from './search-locations.js';
import { createSearchHistoryTool } from './search-history.js';
import { createGetStatisticsTool } from './get-statistics.js';
import { createUpdateConfirmationTool } from './update-confirmation.js';
import { createExecuteUpdateTool } from './execute-update.js';
import { createExportArtworksTool } from './export-artworks.js';
import { createImportFromUrlTool } from './import-from-url.js';

/**
 * 创建所有 AI 工具
 * @param ctx 工具执行上下文
 */
export function createTools(ctx: ToolContext) {
  return {
    search_artworks: createSearchArtworksTool(ctx),
    search_editions: createSearchEditionsTool(ctx),
    search_locations: createSearchLocationsTool(ctx),
    search_history: createSearchHistoryTool(ctx),
    get_statistics: createGetStatisticsTool(ctx),
    generate_update_confirmation: createUpdateConfirmationTool(ctx),
    execute_edition_update: createExecuteUpdateTool(ctx),
    export_artworks: createExportArtworksTool(ctx),
    import_artwork_from_url: createImportFromUrlTool(ctx),
  };
}

/**
 * 创建只读 AI 工具（用于外部 API）
 * @param ctx 工具执行上下文
 */
export function createReadOnlyTools(ctx: ToolContext) {
  return {
    search_artworks: createSearchArtworksTool(ctx),
    search_editions: createSearchEditionsTool(ctx),
    search_locations: createSearchLocationsTool(ctx),
    search_history: createSearchHistoryTool(ctx),
    get_statistics: createGetStatisticsTool(ctx),
  };
}

/** 只读工具名称列表 */
export const READ_ONLY_ACTIONS = [
  'search_artworks',
  'search_editions',
  'search_locations',
  'search_history',
  'get_statistics',
] as const;

export type ReadOnlyAction = typeof READ_ONLY_ACTIONS[number];

export type { ToolContext } from './types.js';
