import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus } from '../useNetworkStatus';

describe('useNetworkStatus', () => {
  let onLineSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    onLineSpy = vi.spyOn(navigator, 'onLine', 'get');
    onLineSpy.mockReturnValue(true);
    vi.useFakeTimers();
    // 默认 fetch 成功（在线）
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('应该返回初始在线状态', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isOffline).toBe(false);
  });

  it('应该返回初始离线状态', () => {
    onLineSpy.mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);
    expect(result.current.isOffline).toBe(true);
  });

  it('应该响应 offline 事件', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('应该响应 online 事件', () => {
    onLineSpy.mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('应该在页面可见时通过 fetch 验证连通性', async () => {
    onLineSpy.mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());

    // 模拟 fetch 成功（网络已恢复）
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // flush promise
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('fetch 失败时应保持离线', async () => {
    onLineSpy.mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());

    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 给 promise 时间 resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('离线时应通过轮询探测恢复', async () => {
    onLineSpy.mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);

    // 模拟网络恢复
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    // 15 秒后轮询探测
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('在线时不应轮询', async () => {
    renderHook(() => useNetworkStatus());
    vi.mocked(globalThis.fetch).mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    // 在线状态不应发起 fetch 探测
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('应该在卸载时清理', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
