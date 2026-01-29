/**
 * Public API endpoint to get project branding info (no auth required)
 * GET /api/profile/public - Returns artist name for login/public pages
 */

import { getSupabase } from '../lib/model-provider';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('users')
    .select('name')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[profile/public] GET error:', error);
  }

  return new Response(
    JSON.stringify({ name: data?.name || null }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
}
