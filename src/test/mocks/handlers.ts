import { http, HttpResponse } from 'msw';

// Supabase URL from environment (mock it for tests)
const SUPABASE_URL = 'https://test.supabase.co';

// Mock data factories
export const createMockArtwork = (overrides = {}) => ({
  id: 'artwork-1',
  source_url: null,
  title_en: 'Test Artwork',
  title_cn: '测试作品',
  year: '2024',
  type: 'Installation',
  materials: 'Mixed media',
  dimensions: '100x200cm',
  duration: null,
  thumbnail_url: 'https://example.com/thumb.jpg',
  edition_total: 3,
  ap_total: 1,
  is_unique: false,
  notes: null,
  deleted_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockEdition = (overrides = {}) => ({
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
  loan_institution: null,
  loan_end: null,
  certificate_number: null,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockLocation = (overrides = {}) => ({
  id: 'location-1',
  name: 'Test Studio',
  type: 'studio',
  aliases: null,
  city: 'Shanghai',
  country: 'China',
  address: '123 Test Street',
  contact: 'test@example.com',
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockEditionHistory = (overrides = {}) => ({
  id: 'history-1',
  edition_id: 'edition-1',
  action: 'status_change',
  from_status: 'in_production',
  to_status: 'in_studio',
  from_location: null,
  to_location: 'location-1',
  related_party: null,
  price: null,
  currency: null,
  notes: 'Completed production',
  created_at: '2024-01-01T00:00:00Z',
  created_by: null,
  ...overrides,
});

// Default mock data
let mockArtworks = [createMockArtwork()];
let mockEditions = [createMockEdition()];
let mockLocations = [createMockLocation()];
let mockEditionHistory = [createMockEditionHistory()];

// Functions to reset/set mock data
export const setMockArtworks = (artworks: typeof mockArtworks) => {
  mockArtworks = artworks;
};

export const setMockEditions = (editions: typeof mockEditions) => {
  mockEditions = editions;
};

export const setMockLocations = (locations: typeof mockLocations) => {
  mockLocations = locations;
};

export const setMockEditionHistory = (history: typeof mockEditionHistory) => {
  mockEditionHistory = history;
};

export const resetMockData = () => {
  mockArtworks = [createMockArtwork()];
  mockEditions = [createMockEdition()];
  mockLocations = [createMockLocation()];
  mockEditionHistory = [createMockEditionHistory()];
};

// Handlers
export const handlers = [
  // Artworks list
  http.get(`${SUPABASE_URL}/rest/v1/artworks`, ({ request }) => {
    const url = new URL(request.url);
    // select param is available but we process all artworks the same way
    void url.searchParams.get('select');

    // Filter out soft-deleted artworks
    const filteredArtworks = mockArtworks.filter(a => a.deleted_at === null);

    return HttpResponse.json(filteredArtworks);
  }),

  // Single artwork
  http.get(`${SUPABASE_URL}/rest/v1/artworks`, ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (id) {
      const idValue = id.replace('eq.', '');
      const artwork = mockArtworks.find(a => a.id === idValue && a.deleted_at === null);
      return HttpResponse.json(artwork ? [artwork] : []);
    }

    return HttpResponse.json(mockArtworks.filter(a => a.deleted_at === null));
  }),

  // Editions list with joins
  http.get(`${SUPABASE_URL}/rest/v1/editions`, ({ request }) => {
    const url = new URL(request.url);
    const select = url.searchParams.get('select');

    // If select includes artwork join
    if (select?.includes('artwork') || select?.includes('artworks')) {
      const editionsWithJoins = mockEditions.map(edition => {
        const artwork = mockArtworks.find(a => a.id === edition.artwork_id);
        const location = mockLocations.find(l => l.id === edition.location_id);
        return {
          ...edition,
          artwork: artwork ? {
            id: artwork.id,
            title_en: artwork.title_en,
            title_cn: artwork.title_cn,
            thumbnail_url: artwork.thumbnail_url,
            edition_total: artwork.edition_total,
            deleted_at: artwork.deleted_at,
          } : null,
          location: location ? {
            id: location.id,
            name: location.name,
            address: location.address,
            contact: location.contact,
            notes: location.notes,
          } : null,
        };
      });
      return HttpResponse.json(editionsWithJoins);
    }

    return HttpResponse.json(mockEditions);
  }),

  // Single edition
  http.get(`${SUPABASE_URL}/rest/v1/editions`, ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (id) {
      const idValue = id.replace('eq.', '');
      const edition = mockEditions.find(e => e.id === idValue);
      if (edition) {
        const artwork = mockArtworks.find(a => a.id === edition.artwork_id);
        const location = mockLocations.find(l => l.id === edition.location_id);
        return HttpResponse.json([{
          ...edition,
          artwork: artwork ? {
            id: artwork.id,
            title_en: artwork.title_en,
            title_cn: artwork.title_cn,
            thumbnail_url: artwork.thumbnail_url,
            edition_total: artwork.edition_total,
            deleted_at: artwork.deleted_at,
          } : null,
          location: location ? {
            id: location.id,
            name: location.name,
            address: location.address,
            contact: location.contact,
            notes: location.notes,
          } : null,
        }]);
      }
    }

    return HttpResponse.json([]);
  }),

  // Edition history
  http.get(`${SUPABASE_URL}/rest/v1/edition_history`, ({ request }) => {
    const url = new URL(request.url);
    const editionId = url.searchParams.get('edition_id');

    if (editionId) {
      const idValue = editionId.replace('eq.', '');
      const history = mockEditionHistory.filter(h => h.edition_id === idValue);
      return HttpResponse.json(history);
    }

    return HttpResponse.json(mockEditionHistory);
  }),

  // Edition files
  http.get(`${SUPABASE_URL}/rest/v1/edition_files`, () => {
    return HttpResponse.json([]);
  }),

  // Locations
  http.get(`${SUPABASE_URL}/rest/v1/locations`, () => {
    return HttpResponse.json(mockLocations);
  }),

  // Update edition
  http.patch(`${SUPABASE_URL}/rest/v1/editions`, async ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const body = await request.json() as Record<string, unknown>;

    const index = mockEditions.findIndex(e => e.id === id);
    if (index !== -1) {
      mockEditions[index] = { ...mockEditions[index], ...body };
      return HttpResponse.json([mockEditions[index]]);
    }

    return HttpResponse.json([], { status: 404 });
  }),

  // Create edition
  http.post(`${SUPABASE_URL}/rest/v1/editions`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newEdition = createMockEdition({
      id: `edition-${Date.now()}`,
      ...body,
    });
    mockEditions.push(newEdition);
    return HttpResponse.json([newEdition], { status: 201 });
  }),

  // Delete edition
  http.delete(`${SUPABASE_URL}/rest/v1/editions`, ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.replace('eq.', '');

    mockEditions = mockEditions.filter(e => e.id !== id);
    return HttpResponse.json([]);
  }),
];

export { SUPABASE_URL };
