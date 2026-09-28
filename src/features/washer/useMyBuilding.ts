import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Building } from '@/types/database';

/**
 * The signed-in user's own building, for the settings summary. buildings_read
 * lets any authenticated user read active buildings; this never touches
 * public.profiles for anyone but the caller.
 */
export function useMyBuilding() {
  const { profile } = useAuth();
  const buildingId = profile?.building_id ?? null;

  return useQuery({
    queryKey: ['building', buildingId],
    enabled: isSupabaseConfigured && Boolean(buildingId),
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Building | null> => {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .eq('id', buildingId ?? '')
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as Building | null;
    },
  });
}
