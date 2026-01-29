import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';

interface ProfileData {
  name: string | null;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function fetchProfile(): Promise<ProfileData> {
  const token = await getAccessToken();
  if (!token) {
    return { name: null };
  }

  const response = await fetch('/api/profile', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch profile');
  }

  return response.json();
}

async function updateProfile(name: string | null): Promise<ProfileData> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch('/api/profile', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error('Failed to update profile');
  }

  return response.json();
}

export function useProfile() {
  const query = useQuery({
    queryKey: queryKeys.profile.all,
    queryFn: fetchProfile,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const name = query.data?.name || null;
  const artistName = name || 'aaajiao';
  const studioName = name ? `${name} studio` : 'aaajiao studio';

  return {
    ...query,
    name,
    artistName,
    studioName,
  };
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string | null) => updateProfile(name),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
  });
}

/**
 * Fetch public profile (no auth required) - for Login/PublicView pages
 */
async function fetchPublicProfile(): Promise<ProfileData> {
  const response = await fetch('/api/profile/public');
  if (!response.ok) {
    return { name: null };
  }
  return response.json();
}

export function usePublicProfile() {
  const query = useQuery({
    queryKey: queryKeys.profile.public,
    queryFn: fetchPublicProfile,
    staleTime: 5 * 60 * 1000,
  });

  const name = query.data?.name || null;
  const artistName = name || 'aaajiao';
  const studioName = name ? `${name} studio` : 'aaajiao studio';

  return {
    ...query,
    name,
    artistName,
    studioName,
  };
}
