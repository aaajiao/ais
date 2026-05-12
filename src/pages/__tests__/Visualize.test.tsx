import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import type {
  VisualizationSnapshot,
  VizArtwork,
  VizEdition,
  VizLocation,
  VizHistory,
} from '@/hooks/queries/useVisualizationData';

// Mock useVisualizationData 让 Visualize 拿到稳定的 fake snapshot，
// 这样 4 个 view 的渲染就纯由 props 决定，便于 smoke test。
const mockHookResult = {
  data: undefined as VisualizationSnapshot | undefined,
  isLoading: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
  isFetching: false,
  isSuccess: true,
};

// 不用 vi.importActual —— 它会触发真模块加载 → supabase.ts → createClient() →
// 在 CI 无 VITE_SUPABASE_URL 时抛 "supabaseUrl is required"。
// 类型导入都是 `import type`（编译期擦除），mock 只需暴露 useVisualizationData。
vi.mock('@/hooks/queries/useVisualizationData', () => ({
  useVisualizationData: () => mockHookResult,
}));

import Visualize from '../Visualize';

const fakeArtwork: VizArtwork = {
  id: 'a1',
  title_en: 'Guard, I…',
  title_cn: '保安，我...',
  year: '2024',
  type: 'Installation',
  thumbnail_url: null,
  edition_total: 3,
  ap_total: 1,
  is_unique: false,
  created_at: '2024-01-01T00:00:00Z',
};
const fakeEdition: VizEdition = {
  id: 'e1',
  artwork_id: 'a1',
  inventory_number: 'AAJ-2024-001',
  edition_type: 'numbered',
  edition_number: 1,
  status: 'sold',
  location_id: 'l1',
  sale_price: 5000,
  sale_currency: 'USD',
  sale_date: '2024-06-01',
  buyer_name: 'Buyer',
  created_at: '2024-01-01T00:00:00Z',
};
const fakeLocation: VizLocation = {
  id: 'l1',
  name: 'Studio',
  type: 'studio',
  city: 'Shanghai',
  country: 'China',
};
const fakeHistory: VizHistory = {
  id: 'h1',
  edition_id: 'e1',
  action: 'status_change',
  from_status: 'in_studio',
  to_status: 'sold',
  from_location: null,
  to_location: null,
  created_at: '2024-06-01T00:00:00Z',
};

const fakeSnapshot: VisualizationSnapshot = {
  artworks: [fakeArtwork],
  editions: [fakeEdition],
  locations: [fakeLocation],
  history: [fakeHistory],
  fetchedAt: '2026-05-12T17:34:57.000Z',
};

function renderAt(path: string) {
  return renderWithClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/visualize" element={<Visualize />} />
      </Routes>
    </MemoryRouter>
  );
}

function resetMock() {
  mockHookResult.data = fakeSnapshot;
  mockHookResult.isLoading = false;
  mockHookResult.isError = false;
  mockHookResult.error = null;
  mockHookResult.isFetching = false;
  mockHookResult.isSuccess = true;
  mockHookResult.refetch.mockClear();
}

describe('Visualize page', () => {
  it('loading 状态时显示 loading 文案', () => {
    resetMock();
    mockHookResult.isLoading = true;
    mockHookResult.data = undefined;
    mockHookResult.isSuccess = false;

    renderAt('/visualize');
    expect(screen.getByText('正在读取档案…')).toBeInTheDocument();
  });

  it('error 状态时显示重试按钮', () => {
    resetMock();
    mockHookResult.isError = true;
    mockHookResult.error = new Error('network failed');
    mockHookResult.data = undefined;
    mockHookResult.isSuccess = false;

    renderAt('/visualize');
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
  });

  it('默认渲染 Strata view（无 ?view 参数）', () => {
    resetMock();
    renderAt('/visualize');
    // Strata 视图 heading 出现
    expect(
      screen.getByRole('heading', { name: /Strata.*地层/i })
    ).toBeInTheDocument();
  });

  it('?view=markets 渲染 Markets 视图', async () => {
    resetMock();
    renderAt('/visualize?view=markets');
    // Markets 是 lazy，等 Suspense 解开
    expect(
      await screen.findByRole('heading', { name: /Markets/i })
    ).toBeInTheDocument();
  });

  it('?view=terminal 渲染 Terminal 视图', async () => {
    resetMock();
    renderAt('/visualize?view=terminal');
    expect(
      await screen.findByRole('heading', { name: /Terminal/i })
    ).toBeInTheDocument();
  });

  it('?view=diaspora 渲染 Diaspora 视图', async () => {
    resetMock();
    renderAt('/visualize?view=diaspora');
    expect(
      await screen.findByRole('heading', { name: /Diaspora|流散/i })
    ).toBeInTheDocument();
  });

  it('非法 ?view 值回落到 strata', () => {
    resetMock();
    renderAt('/visualize?view=invalid');
    expect(
      screen.getByRole('heading', { name: /Strata.*地层/i })
    ).toBeInTheDocument();
  });

  it('刷新按钮点击触发 refetch', () => {
    resetMock();
    renderAt('/visualize');
    // 刷新按钮只有 icon，没文字，按钮在 nav 里 —— 用 group selector
    const refreshButtons = screen.getAllByRole('button');
    // 第一个 button 应该是 strata tab；refresh 在 nav 最右
    // 用 disabled 属性识别——刷新按钮在非 fetching 时未 disabled，且 type=button
    const refreshBtn = refreshButtons.find(
      (b) => b.querySelector('svg.lucide-refresh-cw') != null
    );
    expect(refreshBtn).toBeDefined();
    fireEvent.click(refreshBtn!);
    expect(mockHookResult.refetch).toHaveBeenCalledTimes(1);
  });
});
