import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Legend } from './Legend';

describe('Legend', () => {
  const items = [
    { key: 'a', glyph: <span data-testid="glyph-a">A</span>, label: 'Label A' },
    { key: 'b', glyph: <span data-testid="glyph-b">B</span>, label: 'Label B' },
    { key: 'c', glyph: <span data-testid="glyph-c">C</span>, label: 'Label C' },
  ];

  it('渲染所有传入的 item', () => {
    render(<Legend items={items} />);
    expect(screen.getByTestId('visualize-legend')).toBeInTheDocument();
    expect(screen.getByText('Label A')).toBeInTheDocument();
    expect(screen.getByText('Label B')).toBeInTheDocument();
    expect(screen.getByText('Label C')).toBeInTheDocument();
  });

  it('每个 item 的 glyph 都被渲染', () => {
    render(<Legend items={items} />);
    expect(screen.getByTestId('legend-glyph-a')).toBeInTheDocument();
    expect(screen.getByTestId('legend-glyph-b')).toBeInTheDocument();
    expect(screen.getByTestId('legend-glyph-c')).toBeInTheDocument();
  });

  it('separatorBefore 指定的 item 之前插入 │', () => {
    const { container } = render(
      <Legend items={items} separatorBefore="b" />
    );
    // │ 是 aria-hidden 装饰字符，找文本节点
    expect(container.textContent).toContain('│');
  });

  it('不传 separatorBefore 时不渲染 │', () => {
    const { container } = render(<Legend items={items} />);
    expect(container.textContent).not.toContain('│');
  });

  it('空 items 数组不报错且不渲染任何 label', () => {
    render(<Legend items={[]} />);
    expect(screen.getByTestId('visualize-legend')).toBeInTheDocument();
    expect(screen.queryByText('Label A')).not.toBeInTheDocument();
  });
});
