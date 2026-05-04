import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { SelectionToolbar } from './SelectionToolbar';

function makeProps(overrides: Partial<Parameters<typeof SelectionToolbar>[0]> = {}) {
  return {
    selectMode: false,
    selectedCount: 0,
    totalCount: 10,
    onToggleSelectMode: vi.fn(),
    onSelectAll: vi.fn(),
    onExport: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe('SelectionToolbar', () => {
  it('未进入选择模式时只显示「批量管理」按钮', () => {
    const props = makeProps();
    renderWithClient(<SelectionToolbar {...props} />);

    expect(screen.getByRole('button', { name: '批量管理' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument();
  });

  it('点击「批量管理」触发 onToggleSelectMode', () => {
    const props = makeProps();
    renderWithClient(<SelectionToolbar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '批量管理' }));
    expect(props.onToggleSelectMode).toHaveBeenCalledTimes(1);
  });

  it('选择模式且未选任何项时，不显示删除/导出按钮', () => {
    const props = makeProps({ selectMode: true, selectedCount: 0 });
    renderWithClient(<SelectionToolbar {...props} />);

    expect(screen.getByRole('button', { name: '全选' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument();
  });

  it('选择数量与总数相等时，显示「全不选」', () => {
    const props = makeProps({ selectMode: true, selectedCount: 10, totalCount: 10 });
    renderWithClient(<SelectionToolbar {...props} />);

    expect(screen.getByRole('button', { name: '全不选' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '全选' })).not.toBeInTheDocument();
  });

  it('选中至少一项时，显示带计数的删除/导出按钮，并触发对应回调', () => {
    const props = makeProps({ selectMode: true, selectedCount: 3, totalCount: 10 });
    renderWithClient(<SelectionToolbar {...props} />);

    const deleteBtn = screen.getByRole('button', { name: /删除\s*\(3\)/ });
    const exportBtn = screen.getByRole('button', { name: /导出\s*\(3\)/ });

    fireEvent.click(deleteBtn);
    fireEvent.click(exportBtn);
    fireEvent.click(screen.getByRole('button', { name: '全选' }));

    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onExport).toHaveBeenCalledTimes(1);
    expect(props.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('点击「取消」触发 onToggleSelectMode 退出选择模式', () => {
    const props = makeProps({ selectMode: true, selectedCount: 2 });
    renderWithClient(<SelectionToolbar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(props.onToggleSelectMode).toHaveBeenCalledTimes(1);
  });
});
