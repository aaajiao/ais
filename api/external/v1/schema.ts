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
  version: '1.1.0',
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
  parameter_handling: {
    description: 'CRITICAL for clients using OpenAI structured outputs (or any strict-schema LLM): all params below are nullable and optional. Pass null or omit any param you do not want to filter on. The server treats empty string "", 0, and null identically as "unset" (no filter applied). Enum values are applied as filters when present — if you pass `edition_type: "unique"` the server WILL filter to unique editions. Do not pad the request with default values just to satisfy a strict schema; doing so will narrow the search and may zero out results.',
    examples: {
      good: { action: 'search_editions', params: { location: 'London' } },
      bad: { action: 'search_editions', params: { location: 'London', edition_type: 'unique', condition: 'excellent', edition_number: 0, price_max: 0 } },
      bad_outcome: 'The "bad" example would zero out the result set because edition_type/condition/edition_number/price_max all become active filters.',
    },
  },
  actions: {
    search_artworks: {
      description: 'Search artworks by title, year, type, materials. Supports Chinese search terms (auto-translated).',
      params: {
        query: { type: 'string', nullable: true, description: 'Search keywords (title)' },
        year: { type: 'string', nullable: true, description: 'Year (e.g., "2024")' },
        type: { type: 'string', nullable: true, description: 'Artwork type (e.g., "video", "installation")' },
        materials: { type: 'string', nullable: true, description: 'Materials keywords, supports Chinese (e.g., "磁铁" → auto-expanded to "magnet", "magnets", "magnetic")' },
        is_unique: { type: 'boolean', nullable: true, description: 'Whether unique edition' },
      },
    },
    search_editions: {
      description: 'Search editions by artwork title, status, location, type, condition, buyer, price, dates.',
      params: {
        artwork_title: { type: 'string', nullable: true, description: 'Artwork title' },
        edition_number: { type: 'number', nullable: true, description: 'Edition number (server treats 0 as unset)' },
        status: { type: 'string', nullable: true, enum: ['in_production', 'in_studio', 'at_gallery', 'at_museum', 'in_transit', 'sold', 'gifted', 'lost', 'damaged'], description: 'Edition lifecycle status' },
        location: { type: 'string', nullable: true, description: 'Location name, city, or country' },
        edition_type: { type: 'string', nullable: true, enum: ['numbered', 'ap', 'unique'], description: 'Edition type' },
        condition: { type: 'string', nullable: true, enum: ['excellent', 'good', 'fair', 'poor', 'damaged'], description: 'Condition' },
        inventory_number: { type: 'string', nullable: true, description: 'Inventory number' },
        buyer_name: { type: 'string', nullable: true, description: 'Buyer name' },
        price_min: { type: 'number', nullable: true, description: 'Minimum sale price (server treats 0 as unset)' },
        price_max: { type: 'number', nullable: true, description: 'Maximum sale price (server treats 0 as unset)' },
        sold_after: { type: 'string', nullable: true, description: 'Sold after date (YYYY-MM-DD)' },
        sold_before: { type: 'string', nullable: true, description: 'Sold before date (YYYY-MM-DD)' },
      },
    },
    search_locations: {
      description: 'Search locations/galleries by name, city, type, country.',
      params: {
        query: { type: 'string', nullable: true, description: 'Search keywords (name or city)' },
        type: { type: 'string', nullable: true, enum: ['studio', 'gallery', 'museum', 'other'], description: 'Location type' },
        country: { type: 'string', nullable: true, description: 'Country' },
      },
    },
    search_history: {
      description: 'Query edition change history (sales, status changes, location moves, etc.).',
      params: {
        edition_id: { type: 'string', nullable: true, description: 'Edition ID' },
        artwork_title: { type: 'string', nullable: true, description: 'Artwork title' },
        action: {
          type: 'string',
          nullable: true,
          enum: ['created', 'status_change', 'location_change', 'sold', 'consigned', 'returned', 'condition_update', 'file_added', 'file_deleted', 'number_assigned'],
          description: 'Action type',
        },
        after: { type: 'string', nullable: true, description: 'Start date (YYYY-MM-DD)' },
        before: { type: 'string', nullable: true, description: 'End date (YYYY-MM-DD)' },
        related_party: { type: 'string', nullable: true, description: 'Related party (buyer/institution)' },
      },
    },
    get_statistics: {
      description: 'Get inventory statistics: overview, by status, or by location.',
      params: {
        type: {
          type: 'string',
          enum: ['overview', 'by_status', 'by_location'],
          required: true,
          description: 'Statistics type (this param is REQUIRED — pass one of the enum values)',
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
