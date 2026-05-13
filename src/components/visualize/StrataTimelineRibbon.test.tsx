import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import StrataTimelineRibbon from './StrataTimelineRibbon';

/**
 * 测试时 ribbon 必须被父 SVG 包住，因为它返回 <g> 子树。
 */
function renderRibbon(overrides: Partial<React.ComponentProps<typeof StrataTimelineRibbon>> = {}) {
  const props = {
    years: [2014, 2018, 2020, 2024, 2026],
    currentYear: 2024,
    onYearChange: vi.fn(),
    xOffset: 100,
    axisWidth: 400,
    playBtnX: 410,
    yTop: 10,
    ribbonH: 32,
    dropLineH: 200,
    playing: false,
    onPlayToggle: vi.fn(),
    ...overrides,
  };
  const r = renderWithClient(
    <svg viewBox="0 0 600 300">
      <StrataTimelineRibbon {...props} />
    </svg>
  );
  return { ...r, props };
}

describe('StrataTimelineRibbon', () => {
  it('years.length <= 1 → 不渲染 ribbon（沿用单点隐藏契约）', () => {
    const { container } = renderRibbon({ years: [2024], currentYear: 2024 });
    expect(container.querySelector('[data-testid="visualize-timeline"]')).toBeNull();
  });

  it('正常多年份 → 渲染 ribbon <g> + 当前 year text', () => {
    renderRibbon();
    expect(screen.getByTestId('visualize-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('visualize-timeline-current').textContent).toBe('2024');
  });

  it('▼ marker 三角 + drop line 落在 cutoff 对应的 tick x 上', () => {
    const { container } = renderRibbon({
      // currentIdx = 2 of 5
      years: [2014, 2018, 2020, 2024, 2026],
      currentYear: 2020,
      axisWidth: 500,
    });
    // tickW = 500/5 = 100；idx 2 → x = 2*100 + 50 = 250
    const polygon = container.querySelector(
      'polygon[class*="fill-foreground"]'
    );
    expect(polygon).toBeTruthy();
    const points = polygon!.getAttribute('points') ?? '';
    // 顶尖 x = 250
    expect(points.startsWith('250,')).toBe(true);

    // drop line x1 应 = 250
    const lines = Array.from(container.querySelectorAll('line'));
    const dropLine = lines.find(
      (l) => l.getAttribute('stroke-dasharray') === '2 3'
    );
    expect(dropLine).toBeTruthy();
    expect(dropLine!.getAttribute('x1')).toBe('250');
  });

  it('dropLineH=0 → 不渲染 drop line', () => {
    const { container } = renderRibbon({ dropLineH: 0 });
    const dashedLine = Array.from(container.querySelectorAll('line')).find(
      (l) => l.getAttribute('stroke-dasharray') === '2 3'
    );
    expect(dashedLine).toBeUndefined();
  });

  it('拖动 slider → 触发 onYearChange(values[idx])', () => {
    const onYearChange = vi.fn();
    renderRibbon({ onYearChange });
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(onYearChange).toHaveBeenCalledWith(2014);
  });

  it('slider 有正确 a11y 属性（min / max / value / valuetext）', () => {
    renderRibbon({ years: [2020, 2022, 2024], currentYear: 2022 });
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '2');
    expect(slider).toHaveAttribute('value', '1');
    expect(slider).toHaveAttribute('aria-valuetext', '2022');
  });

  it('Play 按钮 → 触发 onPlayToggle，aria-pressed 反映 playing', () => {
    const onPlayToggle = vi.fn();
    renderRibbon({ onPlayToggle, playing: false });
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn.getAttribute('aria-label')).toMatch(/播放|Play/);
    fireEvent.click(btn);
    expect(onPlayToggle).toHaveBeenCalledTimes(1);
  });

  it('playing=true → Pause icon + aria-pressed=true', () => {
    renderRibbon({ playing: true });
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.getAttribute('aria-label')).toMatch(/暂停|Pause/);
  });

  it('颜色全用 currentColor / fill-foreground / stroke-foreground（dark mode 自适配）', () => {
    const { container } = renderRibbon();
    const svgRoot = container.querySelector(
      '[data-testid="visualize-timeline"]'
    );
    expect(svgRoot).toBeTruthy();
    // baseline line 用 stroke="currentColor"
    const baseline = Array.from(svgRoot!.querySelectorAll('line')).find(
      (l) => l.getAttribute('stroke') === 'currentColor'
    );
    expect(baseline).toBeTruthy();
    // marker 用 fill-foreground class
    const marker = svgRoot!.querySelector('polygon');
    expect(marker?.getAttribute('class')).toMatch(/fill-foreground/);
  });
});
