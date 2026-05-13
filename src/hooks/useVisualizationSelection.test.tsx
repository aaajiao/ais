import { useEffect } from 'react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { renderHook, act } from '@testing-library/react';
import {
  parseSelectionParam,
  serializeSelection,
  useVisualizationSelection,
  type VizSelection,
} from './useVisualizationSelection';

// ─── parseSelectionParam ──────────────────────────────────────────────────────

describe('parseSelectionParam', () => {
  it('null → null', () => {
    expect(parseSelectionParam(null)).toBeNull();
  });

  it('empty string → null', () => {
    expect(parseSelectionParam('')).toBeNull();
  });

  it('"artwork:UUID" → {kind, id}', () => {
    expect(parseSelectionParam('artwork:abc-123')).toEqual({
      kind: 'artwork',
      id: 'abc-123',
    });
  });

  it('未知 kind → null（MVP 只接受 artwork）', () => {
    expect(parseSelectionParam('edition:abc-123')).toBeNull();
    expect(parseSelectionParam('buyer:Liliana Gao')).toBeNull();
  });

  it('无冒号 → null', () => {
    expect(parseSelectionParam('artwork')).toBeNull();
  });

  it('空 id → null', () => {
    expect(parseSelectionParam('artwork:')).toBeNull();
  });
});

// ─── serializeSelection ───────────────────────────────────────────────────────

describe('serializeSelection', () => {
  it('artwork:UUID 格式', () => {
    const sel: VizSelection = { kind: 'artwork', id: 'abc-123' };
    expect(serializeSelection(sel)).toBe('artwork:abc-123');
  });
});

// ─── useVisualizationSelection hook ───────────────────────────────────────────

function renderHookAtPath(initialPath: string) {
  // 用 ref 容器 + useEffect 写入，绕开 react-hooks/globals 关于
  // "render 期间外部变量赋值"的 lint rule
  const searchRef: { current: string } = { current: '' };
  function HookHarness() {
    const loc = useLocation();
    useEffect(() => {
      searchRef.current = loc.search;
    }, [loc.search]);
    return null;
  }
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/test"
          element={
            <>
              <HookHarness />
              {children}
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  const hook = renderHook(() => useVisualizationSelection(), { wrapper });
  return {
    ...hook,
    getSearch: () => searchRef.current,
  };
}

describe('useVisualizationSelection', () => {
  it('无 ?sel param → selection = null', () => {
    const { result } = renderHookAtPath('/test');
    expect(result.current.selection).toBeNull();
  });

  it('?sel=artwork:UUID → selection = {kind: artwork, id: UUID}', () => {
    const { result } = renderHookAtPath('/test?sel=artwork:abc-123');
    expect(result.current.selection).toEqual({
      kind: 'artwork',
      id: 'abc-123',
    });
  });

  it('setSelection 写 URL', () => {
    const { result, getSearch } = renderHookAtPath('/test');
    act(() => {
      result.current.setSelection({ kind: 'artwork', id: 'new-id' });
    });
    expect(getSearch()).toContain('sel=artwork');
    // URL encoder 会把 ':' encode 为 %3A
    expect(decodeURIComponent(getSearch())).toContain('sel=artwork:new-id');
  });

  it('setSelection(null) 删 URL param', () => {
    const { result, getSearch } = renderHookAtPath('/test?sel=artwork:abc');
    act(() => {
      result.current.setSelection(null);
    });
    expect(getSearch()).not.toContain('sel=');
  });

  it('isSelected("artwork", id) 正确', () => {
    const { result } = renderHookAtPath('/test?sel=artwork:abc-123');
    expect(result.current.isSelected('artwork', 'abc-123')).toBe(true);
    expect(result.current.isSelected('artwork', 'other-id')).toBe(false);
  });

  it('非法 ?sel value → selection = null (兜底不抛错)', () => {
    const { result } = renderHookAtPath('/test?sel=garbage');
    expect(result.current.selection).toBeNull();
  });
});
