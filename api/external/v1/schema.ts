/**
 * 外部 API Schema 端点
 *
 * GET /api/external/v1/schema
 * 无需认证，返回可用 actions 和参数定义
 * 方便外部 AI 代理理解 API 结构
 */

export const config = {
  runtime: 'edge',
};

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Cache-Control': 'public, max-age=3600',
};

const SCHEMA = {
  name: 'aaajiao_inventory_api',
  version: '1.0.0',
  description: 'Read-only API for querying art inventory data. Authenticate with an API key via X-API-Key header.',
  endpoint: '/api/external/v1/query',
  method: 'POST',
  authentication: {
    type: 'api_key',
    header: 'X-API-Key',
    description: 'API key generated from the Settings page (format: ak_xxx)',
  },
  request_format: {
    action: 'string (required) - one of the available actions',
    params: 'object (optional) - action-specific parameters',
    locale: 'string (optional) - "en" or "zh", defaults to "en"',
  },
  actions: {
    search_artworks: {
      description: 'Search artworks by title, year, type, materials. Supports Chinese search terms (auto-translated).',
      params: {
        query: { type: 'string', description: 'Search keywords (title)' },
        year: { type: 'string', description: 'Year (e.g., "2024")' },
        type: { type: 'string', description: 'Artwork type (e.g., "video", "installation")' },
        materials: { type: 'string', description: 'Materials keywords, supports Chinese (e.g., "磁铁" → auto-expanded to "magnet", "magnets", "magnetic")' },
        is_unique: { type: 'boolean', description: 'Whether unique edition' },
      },
    },
    search_editions: {
      description: 'Search editions by artwork title, status, location, type, condition, buyer, price, dates.',
      params: {
        artwork_title: { type: 'string', description: 'Artwork title' },
        edition_number: { type: 'number', description: 'Edition number' },
        status: { type: 'string', description: 'Status: in_production, in_studio, at_gallery, at_museum, in_transit, sold, gifted, lost, damaged' },
        location: { type: 'string', description: 'Location name, city, or country' },
        edition_type: { type: 'string', enum: ['numbered', 'ap', 'unique'], description: 'Edition type' },
        condition: { type: 'string', enum: ['excellent', 'good', 'fair', 'poor', 'damaged'], description: 'Condition' },
        inventory_number: { type: 'string', description: 'Inventory number' },
        buyer_name: { type: 'string', description: 'Buyer name' },
        price_min: { type: 'number', description: 'Minimum sale price' },
        price_max: { type: 'number', description: 'Maximum sale price' },
        sold_after: { type: 'string', description: 'Sold after date (YYYY-MM-DD)' },
        sold_before: { type: 'string', description: 'Sold before date (YYYY-MM-DD)' },
      },
    },
    search_locations: {
      description: 'Search locations/galleries by name, city, type, country.',
      params: {
        query: { type: 'string', description: 'Search keywords (name or city)' },
        type: { type: 'string', enum: ['studio', 'gallery', 'museum', 'other'], description: 'Location type' },
        country: { type: 'string', description: 'Country' },
      },
    },
    search_history: {
      description: 'Query edition change history (sales, status changes, location moves, etc.).',
      params: {
        edition_id: { type: 'string', description: 'Edition ID' },
        artwork_title: { type: 'string', description: 'Artwork title' },
        action: {
          type: 'string',
          enum: ['created', 'status_change', 'location_change', 'sold', 'consigned', 'returned', 'condition_update', 'file_added', 'file_deleted', 'number_assigned'],
          description: 'Action type',
        },
        after: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        before: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        related_party: { type: 'string', description: 'Related party (buyer/institution)' },
      },
    },
    get_statistics: {
      description: 'Get inventory statistics: overview, by status, or by location.',
      params: {
        type: {
          type: 'string',
          enum: ['overview', 'by_status', 'by_location'],
          required: true,
          description: 'Statistics type',
        },
      },
    },
  },
  example_request: {
    action: 'search_artworks',
    params: { materials: '磁铁' },
    locale: 'zh',
  },
};

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Only GET is allowed' }),
      { status: 405, headers: CORS_HEADERS }
    );
  }

  return new Response(
    JSON.stringify(SCHEMA, null, 2),
    { status: 200, headers: CORS_HEADERS }
  );
}
