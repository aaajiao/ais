import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '../lib/i18n.js';

/**
 * 工具执行上下文
 * 包含所有工具共享的依赖和配置
 */
export interface ToolContext {
  /** Supabase 客户端实例 */
  supabase: SupabaseClient;
  /** 当前认证用户 ID（auth.users.id） */
  userId: string;
  /** 搜索词扩展使用的模型 ID */
  searchExpansionModel?: string;
  /** URL 导入内容提取使用的模型 ID */
  extractionModel?: string;
  /** 用户语言偏好 */
  locale: Locale;
}
