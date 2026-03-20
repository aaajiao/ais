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

  // --- 初始状态 ---

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

  // --- 浏览器事件 ---

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

  // --- visibilitychange 探测 ---

  it('应该在页面可见时通过 fetch 验证连通性', async () => {
    onLineSpy.mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());

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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOnline).toBe(false);
  });

  // --- 离线时立即探测 ---

  it('进入离线状态时应立即 fetch 探测', async () => {
    onLineSpy.mockReturnValue(false);
    vi.mocked(globalThis.fetch).mockClear();

    renderHook(() => useNetworkStatus());

    // mount 后立即触发一次 fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('立即探测成功应恢复在线', async () => {
    onLineSpy.mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOnline).toBe(true);
  });

  // --- 轮询探测 ---

  it('离线时应通过 15s 轮询探测恢复', async () => {
    onLineSpy.mockReturnValue(false);
    // 初始探测失败
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useNetworkStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isOnline).toBe(false);

    // 网络恢复
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 200 }),
    );

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

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // --- HTTP 状态码判断 ---

  it('4xx/5xx 响应也应判定为在线（网络可达）', async () => {
    onLineSpy.mockReturnValue(false);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    const { result } = renderHook(() => useNetworkStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('405 响应也应判定为在线', async () => {
    onLineSpy.mockReturnValue(false);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('Method not allowed', { status: 405 }),
    );

    const { result } = renderHook(() => useNetworkStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOnline).toBe(true);
  });

  // --- 超时处理 ---

  it('fetch 超时应判定为离线', async () => {
    onLineSpy.mockReturnValue(false);
    // 模拟永不 resolve 的请求（会被 AbortController 取消）
    vi.mocked(globalThis.fetch).mockImplementation(
      () => new Promise((_, reject) => {
        // 模拟 abort 触发 reject
        setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 5_000);
      }),
    );

    const { result } = renderHook(() => useNetworkStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(result.current.isOnline).toBe(false);
  });

  // --- 清理 ---

  it('应该在卸载时清理事件监听和定时器', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
