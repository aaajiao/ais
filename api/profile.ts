/**
 * API endpoint to manage user profile (artist/project name)
 * GET /api/profile - Get current user's profile
 * PUT /api/profile - Update current user's profile
 */

import { verifyAuth, unauthorizedResponse, getJsonBody } from './lib/auth';
import { getSupabase } from './lib/model-provider';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const auth = await verifyAuth(req);
  if (!auth.success) {
    return unauthorizedResponse(auth.error || 'Unauthorized');
  }

  const supabase = getSupabase();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('users')
      .select('name')
      .eq('id', auth.userId!)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is fine
      console.error('[profile] GET error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profile' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ name: data?.name || null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (req.method === 'PUT') {
    const body = await getJsonBody<{ name?: string }>(req);
    const name = body.name?.trim() || null;

    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          id: auth.userId!,
          email: auth.userEmail!,
          name,
        },
        { onConflict: 'id' }
      )
      .select('name')
      .single();

    if (error) {
      console.error('[profile] PUT error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update profile' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ name: data?.name || null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response('Method not allowed', { status: 405 });
}
