import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import Timeline from './Timeline';

describe('Timeline', () => {
  it('values.length <= 1 → 不渲染（单点数据无意义）', () => {
    const { container } = renderWithClient(
      <Timeline
        values={[2024]}
        current={2024}
        onChange={() => {}}
        format={(v) => String(v)}
      />
    );
    expect(container.querySelector('[data-testid="visualize-timeline"]')).toBeNull();
  });

  it('values.length === 0 → 不渲染', () => {
    const { container } = renderWithClient(
      <Timeline
        values={[]}
        current={0}
        onChange={() => {}}
        format={(v) => String(v)}
      />
    );
    expect(container.querySelector('[data-testid="visualize-timeline"]')).toBeNull();
  });

  it('正常渲染 range slider + min/max/current labels', () => {
    const values = [2014, 2018, 2020, 2024, 2026];
    renderWithClient(
      <Timeline
        values={values}
        current={2024}
        onChange={() => {}}
        format={(v) => String(v)}
      />
    );

    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '4');
    expect(slider).toHaveAttribute('value', '3');

    // min / max / current 标签都在
    expect(screen.getByText('2014')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByTestId('visualize-timeline-current').textContent).toBe('2024');
  });

  it('拖动 slider → 触发 onChange，传入真实数据点', () => {
    const values = [2014, 2018, 2020, 2024, 2026];
    const onChange = vi.fn();
    renderWithClient(
      <Timeline
        values={values}
        current={2014}
        onChange={onChange}
        format={(v) => String(v)}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(2020);
  });

  it('play 按钮 → 触发 onPlayToggle', () => {
    const onPlayToggle = vi.fn();
    renderWithClient(
      <Timeline
        values={[2014, 2020, 2026]}
        current={2014}
        onChange={() => {}}
        format={(v) => String(v)}
        onPlayToggle={onPlayToggle}
      />
    );

    const playBtn = screen.getByRole('button');
    fireEvent.click(playBtn);
    expect(onPlayToggle).toHaveBeenCalledTimes(1);
  });

  it('playing=true → 按钮 aria-pressed 为 true，且使用 pause 文案', () => {
    renderWithClient(
      <Timeline
        values={[2014, 2020, 2026]}
        current={2014}
        onChange={() => {}}
        format={(v) => String(v)}
        playing={true}
      />
    );

    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    // i18n: 中文环境下 aria-label 应为 "暂停"
    expect(btn.getAttribute('aria-label')).toMatch(/暂停|Pause/);
  });

  it('playing=false → 按钮 aria-pressed 为 false，且使用 play 文案', () => {
    renderWithClient(
      <Timeline
        values={[2014, 2020, 2026]}
        current={2020}
        onChange={() => {}}
        format={(v) => String(v)}
        playing={false}
      />
    );

    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn.getAttribute('aria-label')).toMatch(/播放|Play/);
  });

  it('slider 的 aria-valuetext 反映当前 format 后的值', () => {
    renderWithClient(
      <Timeline
        values={[2014, 2018, 2020]}
        current={2018}
        onChange={() => {}}
        format={(v) => `Year ${v}`}
      />
    );

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuetext', 'Year 2018');
  });

  it('字符串类型 values 也能工作（用于 ISO date）', () => {
    const values = ['2020-03-15', '2022-06-01', '2024-01-01'];
    const onChange = vi.fn();
    renderWithClient(
      <Timeline
        values={values}
        current="2022-06-01"
        onChange={onChange}
        format={(v) => v.slice(0, 7)}
      />
    );

    expect(screen.getByText('2020-03')).toBeInTheDocument();
    expect(screen.getByText('2024-01')).toBeInTheDocument();
    expect(screen.getByTestId('visualize-timeline-current').textContent).toBe('2022-06');

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith('2020-03-15');
  });
});
