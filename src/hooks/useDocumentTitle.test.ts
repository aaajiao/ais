import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from './useDocumentTitle';

// useProfile 内部 import supabase（env-dependent，顶层 side-effect init）。
// 按 CLAUDE.md「vi.mock 不要 importActual env-dependent 模块」的纪律：
// 只 stub 测试运行时用到的 artistName，不 importActual 避免加载真 supabase。
vi.mock('@/hooks/queries/useProfile', () => ({
  useProfile: () => ({ artistName: 'aaajiao' }),
}));

describe('useDocumentTitle', () => {
  beforeEach(() => {
    document.title = 'aaajiao Inventory';
  });

  it('单个 part：「{part} · {品牌}」', () => {
    renderHook(() => useDocumentTitle('作品'));
    expect(document.title).toBe('作品 · aaajiao');
  });

  it('数组 part：用 · 连接，空 / 空白 / null / undefined 被过滤', () => {
    renderHook(() => useDocumentTitle(['作品标题', '', null, '1/3', undefined, '   ']));
    expect(document.title).toBe('作品标题 · 1/3 · aaajiao');
  });

  it('part 为空（数据未加载）只显示品牌，不出现脏标题', () => {
    renderHook(() => useDocumentTitle(undefined));
    expect(document.title).toBe('aaajiao');
  });

  it('brandOverride 覆盖默认 artistName（公开页用 usePublicProfile 的名字）', () => {
    renderHook(() => useDocumentTitle('XX 画廊', 'my studio'));
    expect(document.title).toBe('XX 画廊 · my studio');
  });

  it('卸载时还原上一个标题', () => {
    const { unmount } = renderHook(() => useDocumentTitle('作品'));
    expect(document.title).toBe('作品 · aaajiao');
    unmount();
    expect(document.title).toBe('aaajiao Inventory');
  });

  it('parts 变化时同步更新标题', () => {
    const { rerender } = renderHook(({ p }) => useDocumentTitle(p), {
      initialProps: { p: '作品 A' },
    });
    expect(document.title).toBe('作品 A · aaajiao');
    rerender({ p: '作品 B' });
    expect(document.title).toBe('作品 B · aaajiao');
  });
});
