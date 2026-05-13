import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useBackToList } from './useBackToList';

// ─── react-router-dom useNavigate mock ────────────────────────────────────
// 拦截 navigate 让我们能断言"它被怎么调用了"。useLocation 不 mock —— 测试用
// MemoryRouter 给真实 location.key。
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

/**
 * 渲染 hook 的 wrapper —— `entries=[fallback]` 模拟"用户直接打开 detail URL"
 * （location.key === 'default'）；`entries=[other, fallback]` 模拟"从 list 进
 * detail"（location.key !== 'default'）。包一层 Routes/Route 确保 hook 在
 * router context 里运行。
 */
function makeWrapper(initialEntries: string[], path: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={path} element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    );
  };
}

/** 模拟一个左键 click 事件（必要字段全 stub） */
function makeClickEvent(
  override: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    button: number;
  }> = {}
): React.MouseEvent<HTMLAnchorElement> {
  const preventDefault = vi.fn();
  return {
    preventDefault,
    metaKey: override.metaKey ?? false,
    ctrlKey: override.ctrlKey ?? false,
    shiftKey: override.shiftKey ?? false,
    button: override.button ?? 0,
  } as unknown as React.MouseEvent<HTMLAnchorElement>;
}

describe('useBackToList', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('location.key === "default"（首次直接打开 / deep-link）→ navigate(fallback)', () => {
    // MemoryRouter 用单一 entry → 初始 location.key === 'default'
    const wrapper = makeWrapper(['/editions/abc'], '/editions/:id');
    const { result } = renderHook(() => useBackToList('/editions'), { wrapper });
    const e = makeClickEvent();
    result.current(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/editions');
  });

  it('location.key !== "default"（有 prev history，比如从 visualize 进 detail）→ navigate(-1)', () => {
    // MemoryRouter 多 entry → location.key 是一个非 "default" 的 hash
    const wrapper = makeWrapper(['/visualize', '/editions/abc'], '/editions/:id');
    const { result } = renderHook(() => useBackToList('/editions'), { wrapper });
    const e = makeClickEvent();
    result.current(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('fallback 路径按入参传递（artworks vs editions 两个调用点共用一个 hook）', () => {
    const wrapper = makeWrapper(['/artworks/abc'], '/artworks/:id');
    const { result } = renderHook(() => useBackToList('/artworks'), { wrapper });
    result.current(makeClickEvent());
    expect(mockNavigate).toHaveBeenCalledWith('/artworks');
  });

  it.each([
    ['Cmd+Click', { metaKey: true }],
    ['Ctrl+Click', { ctrlKey: true }],
    ['Shift+Click', { shiftKey: true }],
    ['Middle button', { button: 1 }],
  ])(
    '%s 不拦截：preventDefault 不调用 / navigate 不调用（让浏览器走 <a> 默认行为）',
    (_label, override) => {
      const wrapper = makeWrapper(
        ['/visualize', '/editions/abc'],
        '/editions/:id'
      );
      const { result } = renderHook(() => useBackToList('/editions'), {
        wrapper,
      });
      const e = makeClickEvent(override);
      result.current(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    }
  );
});
