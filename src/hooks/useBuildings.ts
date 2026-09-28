import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Building } from '@/types/database';

/**
 * The only shape a picker needs. Kept narrow on purpose: the buildings list is
 * read by profile setup and by the schedule screen, and neither needs campus,
 * sort_order or active once the query has filtered and ordered the rows.
 */
export type BuildingOption = Pick<Building, 'id' | 'name' | 'slug'>;

export const buildingsQueryKey = ['buildings', 'active'] as const;

/**
 * Active buildings in the order the web product lists them. RLS already limits
 * this table to `active or is_admin()`, but the filter keeps the hook honest for
 * an admin session too.
 *
 * Buildings change about once a year, so the list is cached hard.
 */
export function useBuildings(): UseQueryResult<BuildingOption[], Error> {
  return useQuery<BuildingOption[], Error>({
    queryKey: buildingsQueryKey,
    enabled: isSupabaseConfigured,
    staleTime: 1000 * 60 * 60 * 12,
    gcTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name, slug')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as BuildingOption[];
    },
  });
}

/** Resolves a building id to its row without a second network round trip. */
export function useBuilding(buildingId: string | null | undefined): BuildingOption | null {
  const { data } = useBuildings();
  return useMemo(
    () => (buildingId ? (data ?? []).find((b) => b.id === buildingId) ?? null : null),
    [data, buildingId],
  );
}
