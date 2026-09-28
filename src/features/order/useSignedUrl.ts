import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const DEFAULT_TTL_SECONDS = 3600;

const ABSOLUTE = /^https?:\/\//i;

export function signedUrlKey(bucket: string, path: string | null | undefined) {
  return ['signed-url', bucket, path ?? null] as const;
}

/**
 * Resolves an object path in a PRIVATE Storage bucket ('avatars',
 * 'delivery-proof') to a temporary viewable URL. Values that are already
 * absolute URLs pass straight through, so seed data and OAuth avatars work too.
 */
export function useSignedUrl(
  bucket: string,
  path: string | null | undefined,
  expiresIn: number = DEFAULT_TTL_SECONDS,
): { url: string | null; loading: boolean; failed: boolean } {
  const passthrough = typeof path === 'string' && ABSOLUTE.test(path);
  const enabled = Boolean(path) && !passthrough && isSupabaseConfigured;

  const query = useQuery({
    queryKey: signedUrlKey(bucket, path),
    enabled,
    retry: 1,
    // Refresh a minute before the signature lapses so an <Image> never 403s.
    staleTime: Math.max(expiresIn - 60, 30) * 1000,
    gcTime: Math.max(expiresIn - 60, 30) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path as string, expiresIn);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (passthrough) return { url: path as string, loading: false, failed: false };

  return {
    url: query.data ?? null,
    loading: enabled && query.isPending,
    failed: Boolean(query.error),
  };
}
