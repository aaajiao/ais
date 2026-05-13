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
    ribbonH: 44,
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

  it('键盘改 slider value → 触发 onDateChange（保留 a11y）', () => {
    // pointer 已迁到 overlay rect；range input 仍在，仅服务键盘 / screen reader
    // a11y。fireEvent.change 模拟键盘步进（← → 调 setIdx）。
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

  // ─── v1.6 修复：pointer 走 SVG rect overlay（连续时间映射），不走 native range
  it('pointer click 在 overlay 25% 位置 → 选最接近的 sale date', () => {
    // dates: 2020-01-15..2024-12-01, span ≈ 5 年
    // ratio 0.25 → 大约 2021-03，最近的 date 是 '2021-06-01'
    const onDateChange = vi.fn();
    const { container } = renderRibbon({ onDateChange });
    const overlay = container.querySelector(
      '[data-testid="markets-ribbon-click-overlay"]'
    ) as SVGRectElement | null;
    expect(overlay).toBeTruthy();
    overlay!.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 44,
        width: 500,
        height: 44,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.pointerDown(overlay!, { clientX: 125, pointerId: 1 });
    expect(onDateChange).toHaveBeenCalledWith('2021-06-01');
  });

  it('pointer click 在 overlay 50% / 0% / 100% 位置 → 选对应最近 date', () => {
    const onDateChange = vi.fn();
    const { container } = renderRibbon({ onDateChange });
    const overlay = container.querySelector(
      '[data-testid="markets-ribbon-click-overlay"]'
    ) as SVGRectElement | null;
    overlay!.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 44,
        width: 500,
        height: 44,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    // ratio 0.5 → 2022-07，最近 '2022-09-30'
    fireEvent.pointerDown(overlay!, { clientX: 250, pointerId: 1 });
    fireEvent.pointerUp(overlay!, { clientX: 250, pointerId: 1 });
    expect(onDateChange).toHaveBeenCalledWith('2022-09-30');

    // ratio 0 → 最近 '2020-01-15'
    fireEvent.pointerDown(overlay!, { clientX: 0, pointerId: 1 });
    fireEvent.pointerUp(overlay!, { clientX: 0, pointerId: 1 });
    expect(onDateChange).toHaveBeenCalledWith('2020-01-15');

    // ratio 1 → 最近 '2024-12-01'
    fireEvent.pointerDown(overlay!, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(overlay!, { clientX: 500, pointerId: 1 });
    expect(onDateChange).toHaveBeenCalledWith('2024-12-01');
  });

  it('pointerDown 后 pointerMove → 持续触发 onDateChange（drag）', () => {
    const onDateChange = vi.fn();
    const { container } = renderRibbon({ onDateChange });
    const overlay = container.querySelector(
      '[data-testid="markets-ribbon-click-overlay"]'
    ) as SVGRectElement | null;
    overlay!.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 44,
        width: 500,
        height: 44,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    // down 在左端
    fireEvent.pointerDown(overlay!, { clientX: 0, pointerId: 1 });
    // drag 到右端
    fireEvent.pointerMove(overlay!, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(overlay!, { clientX: 500, pointerId: 1 });
    // 至少触发两次：down + move
    expect(onDateChange.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(onDateChange).toHaveBeenCalledWith('2020-01-15');
    expect(onDateChange).toHaveBeenCalledWith('2024-12-01');
  });

  it('pointerMove 在未 down 时不触发 onDateChange（避免悬停 hijack）', () => {
    const onDateChange = vi.fn();
    const { container } = renderRibbon({ onDateChange });
    const overlay = container.querySelector(
      '[data-testid="markets-ribbon-click-overlay"]'
    ) as SVGRectElement | null;
    overlay!.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 44,
        width: 500,
        height: 44,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.pointerMove(overlay!, { clientX: 100, pointerId: 1 });
    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('overlay 宽度 = axisWidth，不延伸到 Play 按钮区域', () => {
    const { container } = renderRibbon();
    const overlay = container.querySelector(
      '[data-testid="markets-ribbon-click-overlay"]'
    );
    expect(overlay?.getAttribute('width')).toBe('500');
    expect(overlay?.getAttribute('x')).toBe('0');
  });

  it('点击 X 位置后 marker 落点跟选中 date 的时间映射一致（连续坐标系闭环）', () => {
    // 关键回归：onDateChange 收到的 date，其 dateToX 算出的 markerX 跟点击点
    // ratio 对应的 SVG X 接近 —— 因为 dates 不等距，"最近 date" 的 markerX
    // 跟点击 X 偏差 < 一个 bin 宽，但二者用同一坐标系。
    const onDateChange = vi.fn();
    const { container, rerender } = renderRibbon({ onDateChange });
    const overlay = container.querySelector(
      '[data-testid="markets-ribbon-click-overlay"]'
    ) as SVGRectElement | null;
    overlay!.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 44,
        width: 500,
        height: 44,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.pointerDown(overlay!, { clientX: 250, pointerId: 1 });
    const selectedDate = onDateChange.mock.calls[0][0] as string;
    expect(selectedDate).toBe('2022-09-30');

    // rerender 模拟父组件接到 onDateChange 后回写 currentDate
    rerender(
      <svg viewBox="0 0 600 500">
        <MarketsTimelineRibbon
          dates={['2020-01-15', '2021-06-01', '2022-09-30', '2023-04-12', '2024-12-01']}
          currentDate={selectedDate}
          onDateChange={onDateChange}
          xOffset={16}
          axisWidth={500}
          playBtnX={520}
          yTop={8}
          ribbonH={44}
          playing={false}
          onPlayToggle={vi.fn()}
        />
      </svg>
    );

    // 找新的 marker 位置；用同一连续时间映射应该跟点击点 250 偏差有限
    const marker = container.querySelector(
      '[data-testid="visualize-timeline-marker"]'
    );
    const points = marker!.getAttribute('points')!;
    const markerX = Number(points.split(',')[0]);
    // 2022-09-30 在 [2020-01-15..2024-12-01] 上占比约 0.535，markerX ≈ 267
    // 距点击点 250 偏差应 < 50（远小于"完全错位"的情况）
    expect(Math.abs(markerX - 250)).toBeLessThan(50);
  });

  it('range input 容器与 input 本身都 pointer-events: none（不抢 overlay 的点击）', () => {
    const { container } = renderRibbon();
    // foreignObject pointerEvents 属性
    const fos = Array.from(container.querySelectorAll('foreignObject'));
    const inputFo = fos.find((fo) => fo.querySelector('input[type="range"]'));
    expect(inputFo).toBeTruthy();
    expect(inputFo!.getAttribute('pointer-events')).toBe('none');
    // input 本身 inline style
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.style.pointerEvents).toBe('none');
  });

  it('overlay rect 自带 pointer-events="all" + cursor: pointer', () => {
    const { container } = renderRibbon();
    const overlay = container.querySelector(
      '[data-testid="markets-ribbon-click-overlay"]'
    ) as SVGRectElement | null;
    expect(overlay?.getAttribute('pointer-events')).toBe('all');
    expect(overlay?.getAttribute('fill')).toBe('transparent');
    expect(overlay?.style.cursor).toBe('pointer');
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

  it('caption (YYYY-MM) 几何上独占顶行，不被 histogram bar 遮挡', () => {
    // v1.6.x 回归：之前 caption y≈11 落在 histogram 区 [0, HIST_AREA_H=22] 内，
    // 跟 bar 同色 fill-foreground，max-count bin 满高时 caption 被吞。
    // 修复后 caption 独占 y ∈ [0, TOP_LABEL_H=12]，histogram 整体下移到
    // y ∈ [12, 12+HIST_AREA_H=32]。
    const { container } = renderRibbon();
    const caption = container.querySelector(
      '[data-testid="visualize-timeline-current"]'
    );
    expect(caption).toBeTruthy();
    const captionY = Number(caption!.getAttribute('y'));
    // caption 的 baseline 必须 ≤ TOP_LABEL_H（12）
    expect(captionY).toBeLessThanOrEqual(12);

    // 每根 hist-bar 的 y（在带 translate(0, TOP_LABEL_H) 的 group 里本地坐标
    // 是 HIST_AREA_H - h；getBBox 在 jsdom 不可靠，所以验证父 group 的
    // transform 携带正确的 translate）
    const bars = Array.from(
      container.querySelectorAll('[data-testid^="hist-bar-"]')
    );
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      const parentG = bar.parentElement as Element | null;
      expect(parentG?.getAttribute('transform')).toBe('translate(0, 12)');
      // bar 本地 y >= 0（HIST_AREA_H - h，h ≤ HIST_AREA_H）
      const barY = Number(bar.getAttribute('y'));
      expect(barY).toBeGreaterThanOrEqual(0);
      // 加上父 group 的 translate 后，bar 在 ribbon 内的绝对 y ≥ TOP_LABEL_H
      expect(barY + 12).toBeGreaterThanOrEqual(12);
    }
  });

  it('caption x 被 clamp，marker 在 ribbon 两端时文字不伸出 [0, axisWidth] 压到兄弟元素', () => {
    // v1.6.x 回归：caption textAnchor="middle" + x={markerCx}，当 markerCx≈0 或 axisWidth
    // 时文字两侧伸出 ribbon 自身边界，压到 currency label 列 / Play 按钮区。
    // 修复：caption.x clamp 到 [CAPTION_HALF_W, axisWidth - CAPTION_HALF_W] = [24, 476]。
    // Marker 三角不动（仍严格 markerCx），仅 caption 移位。
    const CAPTION_HALF_W = 24;
    const axisWidth = 500;

    // 左端：currentDate = dates[0] → markerCx = 0 → caption.x clamp 到 24
    {
      const { container } = renderRibbon({
        currentDate: '2020-01-15',
      });
      const caption = container.querySelector(
        '[data-testid="visualize-timeline-current"]'
      );
      const captionX = Number(caption!.getAttribute('x'));
      expect(captionX).toBe(CAPTION_HALF_W);
      // marker 不被 clamp，仍在 markerCx=0
      const marker = container.querySelector(
        '[data-testid="visualize-timeline-marker"]'
      );
      const markerX = Number(marker!.getAttribute('points')!.split(',')[0]);
      expect(markerX).toBe(0);
    }

    // 右端：currentDate = dates[last] → markerCx = axisWidth → caption.x clamp 到 axisWidth - 24
    {
      const { container } = renderRibbon({
        currentDate: '2024-12-01',
      });
      const caption = container.querySelector(
        '[data-testid="visualize-timeline-current"]'
      );
      const captionX = Number(caption!.getAttribute('x'));
      expect(captionX).toBe(axisWidth - CAPTION_HALF_W);
      const marker = container.querySelector(
        '[data-testid="visualize-timeline-marker"]'
      );
      const markerX = Number(marker!.getAttribute('points')!.split(',')[0]);
      expect(markerX).toBe(axisWidth);
    }

    // 中段：currentDate 远离边界 → caption.x 跟 markerCx 一致（无 clamp 介入）
    {
      const { container } = renderRibbon();
      const caption = container.querySelector(
        '[data-testid="visualize-timeline-current"]'
      );
      const marker = container.querySelector(
        '[data-testid="visualize-timeline-marker"]'
      );
      const captionX = Number(caption!.getAttribute('x'));
      const markerX = Number(marker!.getAttribute('points')!.split(',')[0]);
      expect(captionX).toBe(markerX);
    }
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
