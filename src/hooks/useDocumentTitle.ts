import { useEffect } from 'react';
import { useProfile } from '@/hooks/queries/useProfile';

/**
 * 设置浏览器 tab 标题为「{...parts} · {品牌}」，组件卸载 / parts 变化时还原上一个标题。
 *
 * - 品牌默认取登录用户配置的 `artistName`（`useProfile`，缺省 "aaajiao"），与侧栏 appTitle 一致。
 * - 公开页（无登录态，如 PublicView / Login）用 `brandOverride` 传入 `usePublicProfile` 的
 *   `artistName`，这样匿名访客也能看到配置后的名字（`useProfile` 无 token 时拿不到）。
 * - `parts` 为空（数据未加载）时只显示品牌，避免闪烁脏标题。
 *
 * @param parts 标题主体片段，单个字符串或数组（空 / 空白 / null / undefined 会被过滤）
 * @param brandOverride 覆盖品牌后缀（公开页使用）
 */
export function useDocumentTitle(
  parts?: string | (string | null | undefined)[],
  brandOverride?: string,
): void {
  const { artistName } = useProfile();
  const brand = brandOverride || artistName;

  const segments = (Array.isArray(parts) ? parts : [parts]).filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  );
  const title = segments.length > 0 ? `${segments.join(' · ')} · ${brand}` : brand;

  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
