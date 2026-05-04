import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import EditableConfirmCard, { type ConfirmCardData } from './EditableConfirmCard';

function makeCard(overrides: Partial<ConfirmCardData> = {}): ConfirmCardData {
  return {
    type: 'confirmation_card',
    edition_id: 'edition-1',
    current: {
      artwork_title: 'Guard',
      edition_number: 1,
      edition_total: 3,
      status: 'in_studio',
    },
    updates: {
      status: 'sold',
      sale_price: 50000,
      sale_currency: 'USD',
      buyer_name: 'AI 推断的买家',
    },
    reason: 'AI 根据消息推断',
    requires_confirmation: true,
    ...overrides,
  };
}

describe('EditableConfirmCard', () => {
  it('查看模式下渲染 AI 提议的字段（标题、状态、价格、买家）', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithClient(
      <EditableConfirmCard data={makeCard()} onConfirm={onConfirm} onCancel={onCancel} />
    );

    expect(screen.getByText('Guard')).toBeInTheDocument();
    expect(screen.getByText(/\(1\/3\)/)).toBeInTheDocument();
    expect(screen.getByText(/USD\s*50,000/)).toBeInTheDocument();
    expect(screen.getByText('AI 推断的买家')).toBeInTheDocument();
    expect(screen.getByText('AI 根据消息推断')).toBeInTheDocument();
  });

  it('点击「取消」调用 onCancel 不调用 onConfirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithClient(
      <EditableConfirmCard data={makeCard()} onConfirm={onConfirm} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('查看模式直接确认时，传给 onConfirm 的是原始 AI 数据', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const data = makeCard();
    renderWithClient(
      <EditableConfirmCard data={data} onConfirm={onConfirm} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole('button', { name: /确认/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(data);
  });

  it('用户进入内联编辑修改买家与价格后确认，onConfirm 收到的是用户编辑后的值', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const data = makeCard();
    renderWithClient(
      <EditableConfirmCard data={data} onConfirm={onConfirm} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    const buyerInput = screen.getByPlaceholderText('买家名称（可选）') as HTMLInputElement;
    fireEvent.change(buyerInput, { target: { value: '真实买家' } });

    const priceInput = screen.getByPlaceholderText('输入金额') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '88888' } });

    fireEvent.click(screen.getByRole('button', { name: '完成编辑' }));

    fireEvent.click(screen.getByRole('button', { name: /确认/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const submitted = onConfirm.mock.calls[0][0] as ConfirmCardData;
    expect(submitted.updates.buyer_name).toBe('真实买家');
    expect(submitted.updates.sale_price).toBe(88888);
    expect(submitted.updates.buyer_name).not.toBe(data.updates.buyer_name);
  });

  it('完整编辑模式中切换状态后保存返回，确认时新状态被传出', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const data = makeCard({ updates: { status: 'in_studio' } });
    renderWithClient(
      <EditableConfirmCard data={data} onConfirm={onConfirm} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole('button', { name: '详细编辑' }));
    fireEvent.click(screen.getByRole('button', { name: /已售/ }));
    fireEvent.click(screen.getByRole('button', { name: '保存并返回' }));

    fireEvent.click(screen.getByRole('button', { name: /确认/ }));

    const submitted = onConfirm.mock.calls[0][0] as ConfirmCardData;
    expect(submitted.updates.status).toBe('sold');
  });

  it('isSubmitting 为 true 时，确认/取消/编辑按钮被禁用', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithClient(
      <EditableConfirmCard
        data={makeCard()}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isSubmitting
      />
    );

    expect(screen.getByRole('button', { name: /处理中/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '编辑' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '详细编辑' })).toBeDisabled();
  });
});
