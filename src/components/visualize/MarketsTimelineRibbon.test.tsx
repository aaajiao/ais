import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import MarketsTimelineRibbon from './MarketsTimelineRibbon';

function renderRibbon(
  overrides: Partial<React.ComponentProps<typeof MarketsTimelineRibbon>> = {}
) {
  const props = {
    dates: ['2020-01-15', '2021-06-01', '2022-09-30', '2023-04-12', '2024-12-01'],
    currentDate: '2023-04-12',
    onDateChange: vi.fn(),
    xOffset: 16,
    axisWidth: 500,
    playBtnX: 520,
    yTop: 8,
    ribbonH: 40,
    playing: false,
    onPlayToggle: vi.fn(),
    ...overrides,
  };
  const r = renderWithClient(
    <svg viewBox="0 0 600 500">
      <MarketsTimelineRibbon {...props} />
    </svg>
  );
  return { ...r, props };
}

describe('MarketsTimelineRibbon', () => {
  it('dates.length <= 1 → 不渲染', () => {
    const { container } = renderRibbon({
      dates: ['2024-01-01'],
      currentDate: '2024-01-01',
    });
    expect(container.querySelector('[data-testid="visualize-timeline"]')).toBeNull();
  });

  it('正常多 sale_date → 渲染 ribbon <g> + 当前日期 (YYYY-MM)', () => {
    renderRibbon();
    expect(screen.getByTestId('visualize-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('visualize-timeline-current').textContent).toBe(
      '2023-04'
    );
  });

  it('histogram bars 渲染：每个非空 bin 一个 bar', () => {
    // dates span 2020..2024 → yearSpan=4 < 5 → month bins
    // 但只有 5 个 distinct dates，所以多数 bin 是空，只有 5 个非空 bar
    const { container } = renderRibbon();
    const ribbonG = container.querySelector(
      '[data-testid="visualize-timeline"]'
    )!;
    const bars = Array.from(ribbonG.querySelectorAll('rect')).filter(
      (r) => r.getAttribute('data-testid')?.startsWith('hist-bar-')
    );
    expect(bars.length).toBe(5);
  });

  it('cutoff 之后的 bin 走 future opacity 0.15', () => {
    // currentDate=2023-04-12 → bin >= 2023-05 应该 dim
    const { container } = renderRibbon();
    const ribbonG = container.querySelector(
      '[data-testid="visualize-timeline"]'
    )!;
    const bars = Array.from(ribbonG.querySelectorAll('rect')).filter(
      (r) => r.getAttribute('data-testid')?.startsWith('hist-bar-')
    );
    // bars 含 2020-01-15, 2021-06-01, 2022-09-30, 2023-04-12 (≤ cutoff), 2024-12-01 (> cutoff)
    const future = bars.filter((b) => b.getAttribute('opacity') === '0.15');
    const past = bars.filter((b) => b.getAttribute('opacity') === '1');
    expect(past.length).toBe(4);
    expect(future.length).toBe(1);
  });

  it('▼ marker 落在 cutoff 对应的连续时间轴位置', () => {
    // dates: 2020-01-15..2024-12-01. cutoff 2023-04-12.
    // markerX = (cutoff_ms - min_ms) / (max_ms - min_ms) * 500
    // 大致在 65% 位置（约 320~340）
    const { container } = renderRibbon();
    const marker = container.querySelector(
      '[data-testid="visualize-timeline-marker"]'
    );
    expect(marker).toBeTruthy();
    const points = marker!.getAttribute('points')!;
    const markerX = Number(points.split(',')[0]);
    expect(markerX).toBeGreaterThan(300);
    expect(markerX).toBeLessThan(360);
  });

  it('不渲染 drop line（M1.5 改造后 Markets ribbon 不向下穿透 chart）', () => {
    const { container } = renderRibbon();
    const dashedLines = Array.from(container.querySelectorAll('line')).filter(
      (l) => l.getAttribute('stroke-dasharray') === '2 3'
    );
    expect(dashedLines.length).toBe(0);
  });

  it('拖动 slider → 触发 onDateChange(dates[idx])', () => {
    const onDateChange = vi.fn();
    renderRibbon({ onDateChange });
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(onDateChange).toHaveBeenCalledWith('2020-01-15');
  });

  it('a11y：valuetext 是 YYYY-MM 格式', () => {
    renderRibbon();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuetext', '2023-04');
  });

  it('Play 按钮触发 onPlayToggle', () => {
    const onPlayToggle = vi.fn();
    renderRibbon({ onPlayToggle });
    fireEvent.click(screen.getByRole('button'));
    expect(onPlayToggle).toHaveBeenCalledTimes(1);
  });

  it('tick label 稀疏（含首尾 + 中间均匀采样，bin 多时不全部标）', () => {
    // 12 个月数据 → yearSpan=0 → 月分桶 12 个 bin
    const dates = Array.from({ length: 12 }, (_, i) =>
      `2020-${String(i + 1).padStart(2, '0')}-01`
    );
    const { container } = renderRibbon({
      dates,
      currentDate: dates[6],
    });
    const ribbonG = container.querySelector(
      '[data-testid="visualize-timeline"]'
    );
    const tickLabels = Array.from(ribbonG!.querySelectorAll('text')).filter(
      (n) =>
        n.getAttribute('data-testid') !== 'visualize-timeline-current' &&
        /^\d{4}(-\d{2})?$/.test(n.textContent ?? '')
    );
    expect(tickLabels.length).toBeLessThan(dates.length);
    expect(tickLabels.length).toBeGreaterThanOrEqual(2);
  });

  it('颜色全用 currentColor / fill-foreground', () => {
    const { container } = renderRibbon();
    const ribbonG = container.querySelector(
      '[data-testid="visualize-timeline"]'
    );
    const baseline = Array.from(ribbonG!.querySelectorAll('line')).find(
      (l) => l.getAttribute('stroke') === 'currentColor'
    );
    expect(baseline).toBeTruthy();
    const marker = ribbonG!.querySelector('polygon');
    expect(marker?.getAttribute('class')).toMatch(/fill-foreground/);
  });
});
