import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Cross-view selection (M3a, v1.6.x 起)
 *
 * MVP scope —— 只支持 kind: 'artwork'。选中一件作品时，所有 4 个 viz view
 * 同步加 selection ring / dashed edges。`kind: 'edition' | 'buyer' | 'location'`
 * 留给未来扩展，**不要**在 MVP 阶段扩这个 union，避免 scope creep。
 *
 * URL state: `?sel=artwork:UUID`（key=`sel`，value 格式 `${kind}:${id}`）。
 * 跟 Strata / Markets 现有的 `?t=` time scrubber 用不同 param key 不冲突。
 *
 * 解析失败 / kind 未知 → selection = null（不抛错）。
 */

export type VizSelectionKind = 'artwork';

export interface VizSelection {
  kind: VizSelectionKind;
  id: string;
}

const SEL_PARAM = 'sel';

/** "artwork:UUID" → VizSelection | null */
export function parseSelectionParam(raw: string | null): VizSelection | null {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx <= 0 || idx >= raw.length - 1) return null;
  const kindStr = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (kindStr !== 'artwork') return null; // MVP: 只接受 artwork
  if (!id) return null;
  return { kind: 'artwork', id };
}

/** VizSelection → "artwork:UUID" 字符串 */
export function serializeSelection(sel: VizSelection): string {
  return `${sel.kind}:${sel.id}`;
}

export interface UseVisualizationSelectionResult {
  selection: VizSelection | null;
  setSelection: (sel: VizSelection | null) => void;
  isSelected: (kind: VizSelectionKind, id: string) => boolean;
}

/**
 * 读 / 写 URL 的 `?sel=` 参数，给 4 个 viz view 共享 selection 状态。
 *
 * - setSelection(null) → 从 URL 删除 sel 参数
 * - setSelection({kind, id}) → 写 sel 参数
 * - isSelected(kind, id) → 当前 selection 匹配时返回 true
 *
 * URL 通过 replace: false 写入，让 selection 进浏览器历史（用户可以 back 撤销）。
 */
export function useVisualizationSelection(): UseVisualizationSelectionResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(SEL_PARAM);
  const selection = parseSelectionParam(raw);

  const setSelection = useCallback(
    (sel: VizSelection | null) => {
      const next = new URLSearchParams(searchParams);
      if (sel === null) {
        next.delete(SEL_PARAM);
      } else {
        next.set(SEL_PARAM, serializeSelection(sel));
      }
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams]
  );

  const isSelected = useCallback(
    (kind: VizSelectionKind, id: string): boolean => {
      return selection !== null && selection.kind === kind && selection.id === id;
    },
    [selection]
  );

  return { selection, setSelection, isSelected };
}
