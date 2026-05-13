import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import MarketsTimelineRibbon from './MarketsTimelineRibbon';

function renderRibbon(overrides: Partial<React.ComponentProps<typeof MarketsTimelineRibbon>> = {}) {
  const props = {
    dates: ['2020-01-15', '2021-06-01', '2022-09-30', '2023-04-12', '2024-12-01'],
    currentDate: '2023-04-12',
    onDateChange: vi.fn(),
    xOffset: 16,
    axisWidth: 500,
    playBtnX: 520,
    yTop: 8,
    ribbonH: 32,
    dropLineH: 400,
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
    // currentDate=2023-04-12 → slice(0,7) = 2023-04
    expect(screen.getByTestId('visualize-timeline-current').textContent).toBe('2023-04');
  });

  it('▼ marker 落在 cutoff 对应的 tick x（含 tick width 居中偏移）', () => {
    // currentIdx=3, axisWidth=500, len=5 → tickW=100, x = 3*100 + 50 = 350
    const { container } = renderRibbon();
    const polygon = container.querySelector(
      'polygon[class*="fill-foreground"]'
    );
    expect(polygon).toBeTruthy();
    expect(polygon!.getAttribute('points')!.startsWith('350,')).toBe(true);

    const dropLine = Array.from(container.querySelectorAll('line')).find(
      (l) => l.getAttribute('stroke-dasharray') === '2 3'
    );
    expect(dropLine).toBeTruthy();
    expect(dropLine!.getAttribute('x1')).toBe('350');
  });

  it('dropLineH=0 → 不渲染 drop line（无 noPrice lane 但也无主散点的极端情况）', () => {
    const { container } = renderRibbon({ dropLineH: 0 });
    const dashedLine = Array.from(container.querySelectorAll('line')).find(
      (l) => l.getAttribute('stroke-dasharray') === '2 3'
    );
    expect(dashedLine).toBeUndefined();
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

  it('tick label 稀疏（不每个 date 都标，避免视觉过密）', () => {
    // 20 个日期，predicted: 应该最多有 ~6-7 个 label（含首尾 + current）
    const dates = Array.from({ length: 20 }, (_, i) =>
      `2020-${String(i + 1).padStart(2, '0')}-01`
    );
    const { container } = renderRibbon({
      dates,
      currentDate: dates[10],
    });
    const ribbonG = container.querySelector('[data-testid="visualize-timeline"]');
    const allTextLabels = Array.from(ribbonG!.querySelectorAll('text')).filter(
      (n) =>
        n.getAttribute('data-testid') !== 'visualize-timeline-current' &&
        /^\d{4}-\d{2}$/.test(n.textContent ?? '')
    );
    // labels 应严格少于 dates.length（稀疏化生效）
    expect(allTextLabels.length).toBeLessThan(dates.length);
    expect(allTextLabels.length).toBeGreaterThanOrEqual(2);
  });

  it('颜色全用 currentColor / fill-foreground', () => {
    const { container } = renderRibbon();
    const svgRoot = container.querySelector(
      '[data-testid="visualize-timeline"]'
    );
    const baseline = Array.from(svgRoot!.querySelectorAll('line')).find(
      (l) => l.getAttribute('stroke') === 'currentColor'
    );
    expect(baseline).toBeTruthy();
    const marker = svgRoot!.querySelector('polygon');
    expect(marker?.getAttribute('class')).toMatch(/fill-foreground/);
  });
});
