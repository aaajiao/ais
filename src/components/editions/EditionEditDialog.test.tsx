import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';

const updateMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('@/lib/cacheInvalidation', () => ({
  invalidateOnEditionEdit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/queries/useEditions', () => ({
  useEditionsByArtwork: () => ({ data: [] }),
}));

vi.mock('./LocationPicker', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
  }) => (
    <select
      data-testid="location-picker"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">无</option>
      <option value="location-1">Test Studio</option>
      <option value="location-2">Test Gallery</option>
    </select>
  ),
}));

vi.mock('./InventoryNumberInput', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input
      data-testid="inventory-number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('./LocationDialog', () => ({
  default: () => null,
}));

import { renderWithClient } from '@/test/test-utils';
import EditionEditDialog from './EditionEditDialog';
import type { Database } from '@/lib/database.types';

type Edition = Database['public']['Tables']['editions']['Row'] & {
  artwork?: {
    title_en: string;
    edition_total: number | null;
    ap_total: number | null;
    is_unique: boolean | null;
  } | null;
  location?: { name: string } | null;
};

function makeEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: 'edition-1',
    artwork_id: 'artwork-1',
    inventory_number: 'AAJ-2024-001',
    edition_type: 'numbered',
    edition_number: 1,
    status: 'in_studio',
    location_id: 'location-1',
    storage_detail: null,
    condition: 'excellent',
    condition_notes: null,
    sale_price: null,
    sale_currency: null,
    sale_date: null,
    buyer_name: null,
    consignment_start: null,
    consignment_end: null,
    loan_start: null,
    loan_end: null,
    certificate_number: null,
    notes: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    artwork: { title_en: 'Guard', edition_total: 3, ap_total: 0, is_unique: false },
    location: { name: 'Test Studio' },
    ...overrides,
  } as Edition;
}

beforeEach(() => {
  updateMock.mockReset();
  eqMock.mockReset();
  fromMock.mockReset();
  fromMock.mockReturnValue({ update: updateMock });
  updateMock.mockReturnValue({ eq: eqMock });
  eqMock.mockResolvedValue({ error: null });
});

describe('EditionEditDialog', () => {
  it('isOpen 为 false 时不渲染对话框', () => {
    renderWithClient(
      <EditionEditDialog
        isOpen={false}
        edition={makeEdition()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.queryByText('编辑版本')).not.toBeInTheDocument();
  });

  it('in_studio 状态：仅渲染当前状态 + 合法转换目标（不含 in_production）', () => {
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByText('编辑版本')).toBeInTheDocument();
    const statusSelect = screen.getAllByRole('combobox').find(
      (el) => (el as HTMLSelectElement).value === 'in_studio'
    ) as HTMLSelectElement;
    expect(statusSelect).toBeDefined();
    const optionValues = Array.from(statusSelect.options).map((o) => o.value);
    // in_studio 可以转：at_gallery / at_museum / in_transit / sold / gifted / lost / damaged
    expect(optionValues).toEqual([
      'in_studio',
      'at_gallery',
      'at_museum',
      'in_transit',
      'sold',
      'gifted',
      'lost',
      'damaged',
    ]);
    expect(optionValues).not.toContain('in_production');
  });

  it('终态（sold）：UI 允许纠正回 in_studio / 切换到其他终态', () => {
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null, status: 'sold' })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const statusSelect = screen.getAllByRole('combobox').find(
      (el) => (el as HTMLSelectElement).value === 'sold'
    ) as HTMLSelectElement;
    expect(statusSelect).toBeDefined();
    const optionValues = Array.from(statusSelect.options).map((o) => o.value);
    // 当前状态 + 纠错矩阵：in_studio / gifted / lost / damaged
    expect(optionValues).toEqual(['sold', 'in_studio', 'gifted', 'lost', 'damaged']);
  });

  it('终态（gifted）：状态下拉包含纠错目标（in_studio / sold / lost / damaged）', () => {
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null, status: 'gifted' })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const statusSelect = screen.getAllByRole('combobox').find(
      (el) => (el as HTMLSelectElement).value === 'gifted'
    ) as HTMLSelectElement;
    expect(statusSelect).toBeDefined();
    const optionValues = Array.from(statusSelect.options).map((o) => o.value);
    // 当前状态 + 纠错矩阵：in_studio / sold / lost / damaged
    expect(optionValues).toEqual(['gifted', 'in_studio', 'sold', 'lost', 'damaged']);
    // 业务流转目的地（at_gallery / at_museum / in_transit / in_production）不应出现
    expect(optionValues).not.toContain('at_gallery');
    expect(optionValues).not.toContain('at_museum');
    expect(optionValues).not.toContain('in_transit');
    expect(optionValues).not.toContain('in_production');
  });

  it('终态（gifted）：渲染赠出日期输入（复用 sale_date，使用 giftDate label）', () => {
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({
          artwork: null,
          status: 'gifted',
          sale_date: '2025-03-15',
        })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    // gifted 状态下应渲染"赠出日期"label，且不出现"售出日期"
    expect(screen.getByText('赠出日期')).toBeInTheDocument();
    expect(screen.queryByText('售出日期')).not.toBeInTheDocument();

    // 同时确认 buyer 字段也渲染了（gifted 复用 buyer_name，label 仍是"买家"）
    expect(screen.getByText('买家')).toBeInTheDocument();

    // sale_date input 也应该接收到值
    const dateInputs = screen
      .getAllByDisplayValue('2025-03-15')
      .filter((el) => (el as HTMLInputElement).type === 'date');
    expect(dateInputs.length).toBeGreaterThan(0);
  });

  it('终态（sold）：渲染售出日期输入（使用 saleDate label，不渲染 giftDate）', () => {
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null, status: 'sold' })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByText('售出日期')).toBeInTheDocument();
    expect(screen.queryByText('赠出日期')).not.toBeInTheDocument();
  });

  it('非 sold/gifted 状态：不渲染 sale/gift 日期与买家字段', () => {
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null, status: 'in_studio' })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.queryByText('售出日期')).not.toBeInTheDocument();
    expect(screen.queryByText('赠出日期')).not.toBeInTheDocument();
    expect(screen.queryByText('买家')).not.toBeInTheDocument();
  });

  it('in_production 状态：只能转 in_studio 或 damaged', () => {
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null, status: 'in_production' })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const statusSelect = screen.getAllByRole('combobox').find(
      (el) => (el as HTMLSelectElement).value === 'in_production'
    ) as HTMLSelectElement;
    const optionValues = Array.from(statusSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['in_production', 'in_studio', 'damaged']);
    expect(optionValues).not.toContain('sold');
    expect(optionValues).not.toContain('at_gallery');
  });

  it('修改状态后保存，向 supabase.editions.update 传入新状态', async () => {
    const onSaved = vi.fn();
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null })}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    const statusSelect = screen.getAllByRole('combobox').find(
      (el) => (el as HTMLSelectElement).value === 'in_studio'
    ) as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: 'sold' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
    });

    expect(fromMock).toHaveBeenCalledWith('editions');
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][0];
    expect(payload.status).toBe('sold');
    expect(payload.updated_at).toEqual(expect.any(String));
    expect(eqMock).toHaveBeenCalledWith('id', 'edition-1');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('修改位置后保存，新的 location_id 出现在 update payload 中', async () => {
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null, location_id: 'location-1' })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('location-picker'), {
      target: { value: 'location-2' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
    });

    const payload = updateMock.mock.calls[0][0];
    expect(payload.location_id).toBe('location-2');
  });

  it('点击「取消」调用 onClose，不发起 update', () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null })}
        onClose={onClose}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('请求进行中（请求未 resolve）时，保存按钮被禁用', async () => {
    let resolveUpdate: (v: { error: null }) => void = () => {};
    eqMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByRole('button', { name: /保存中/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();

    await act(async () => {
      resolveUpdate({ error: null });
    });
  });

  it('update 返回错误时，显示错误信息且不调用 onSaved', async () => {
    eqMock.mockResolvedValueOnce({ error: new Error('权限不足') });
    const onSaved = vi.fn();

    renderWithClient(
      <EditionEditDialog
        isOpen
        edition={makeEdition({ artwork: null })}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
    });

    expect(screen.getByText('权限不足')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
