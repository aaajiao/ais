import { describe, it, expect, vi } from 'vitest';
import { renderWithClient } from '@/test/test-utils';
import ArtworkEditForm from './ArtworkEditForm';
import type { ArtworkFormData } from './types';

// Mock the useArtworkTypes hook so we don't hit supabase in tests.
// The hook is implemented in terms of useQuery + supabase; here we only care
// that ArtworkEditForm renders the returned types into <datalist>.
vi.mock('@/hooks/queries/useArtworkTypes', () => ({
  useArtworkTypes: () => ({
    data: ['Installation', 'Video', 'Digital printing'],
    isLoading: false,
    error: null,
  }),
}));

function makeFormData(overrides: Partial<ArtworkFormData> = {}): ArtworkFormData {
  return {
    title_en: '',
    title_cn: '',
    year: '',
    type: '',
    materials: '',
    dimensions: '',
    duration: '',
    edition_total: 0,
    ap_total: 0,
    is_unique: false,
    source_url: '',
    thumbnail_url: '',
    notes: '',
    ...overrides,
  };
}

describe('ArtworkEditForm', () => {
  it('在 type input 上挂 list="artwork-types" 并渲染 datalist 选项（来自 useArtworkTypes）', () => {
    const { container } = renderWithClient(
      <ArtworkEditForm
        formData={makeFormData()}
        saving={false}
        onFormChange={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // type input 应有 list 属性指向 artwork-types datalist
    const typeInput = container.querySelector('input[list="artwork-types"]');
    expect(typeInput).not.toBeNull();
    expect(typeInput!.tagName.toLowerCase()).toBe('input');

    // datalist 应渲染 useArtworkTypes 返回的 3 个 option（按频次排序）
    const datalist = container.querySelector('datalist#artwork-types');
    expect(datalist).not.toBeNull();
    const optionValues = Array.from(datalist!.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(optionValues).toEqual(['Installation', 'Video', 'Digital printing']);
  });
});
