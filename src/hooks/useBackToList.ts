import { useLocation, useNavigate } from 'react-router-dom';

/**
 * "返回"按钮 history-aware 处理（EditionDetail / ArtworkDetail 共用）。
 *
 * 行为：
 * - `location.key === 'default'`（首次进入 / deep-link / reload，无 prev history）
 *   → `navigate(fallback)` 跳默认列表（`/editions` 或 `/artworks`）
 * - 否则 → `navigate(-1)` 回上一页（从 visualize 进 detail 后能回 visualize；
 *   从 list 进 detail 后回 list）
 *
 * 修饰键防御：Cmd / Ctrl / Shift / 非左键 click **不拦截**，走 `<a href={fallback}>`
 * 浏览器原生行为（新窗口 / 新标签页打开 fallback URL）。
 *
 * 用法：
 * ```tsx
 * const handleBack = useBackToList('/editions');
 * <a href="/editions" onClick={handleBack}>← 返回</a>
 * ```
 *
 * 守护测试：`src/hooks/useBackToList.test.tsx`。
 */
export function useBackToList(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (location.key === 'default') {
      navigate(fallback);
    } else {
      navigate(-1);
    }
  };
}
