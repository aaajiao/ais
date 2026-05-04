import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import DeleteConfirmDialog from './DeleteConfirmDialog';

describe('DeleteConfirmDialog', () => {
  it('渲染作品标题与版本数量提示', () => {
    renderWithClient(
      <DeleteConfirmDialog
        artworkTitle="Guard"
        editionsCount={3}
        deleting={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: '确认删除' })).toBeInTheDocument();
    expect(screen.getByText(/Guard/)).toBeInTheDocument();
    expect(screen.getByText(/3 个版本/)).toBeInTheDocument();
  });

  it('editionsCount 为 0 时不展示版本警告', () => {
    renderWithClient(
      <DeleteConfirmDialog
        artworkTitle="Guard"
        editionsCount={0}
        deleting={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByText(/个版本/)).not.toBeInTheDocument();
  });

  it('点击「确认」调用 onConfirm，点击「取消」调用 onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithClient(
      <DeleteConfirmDialog
        artworkTitle="Guard"
        editionsCount={1}
        deleting={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('deleting 为 true 时按钮被禁用并显示「删除中...」', () => {
    renderWithClient(
      <DeleteConfirmDialog
        artworkTitle="Guard"
        editionsCount={1}
        deleting
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '删除中...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
  });
});
