import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewRole } from '@/hooks/useViewRole';

/**
 * Resolves the provider_id for the currently logged-in proveedor user.
 * Returns null when the user is not a proveedor or the link is not found.
 * Query is disabled when the user is not logged in as a proveedor.
 */
export function useOwnProviderId(): string | null {
  const { user } = useAuth();
  const { viewRole } = useViewRole();

  const isProvider = viewRole === 'proveedor';

  const { data } = useQuery({
    queryKey: ['own-provider-id', user?.id],
    enabled: isProvider && !!user?.id,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('provider_users')
        .select('provider_id')
        .eq('user_id', user!.id)
        .eq('active', true)
        .maybeSingle();
      return data?.provider_id ?? null;
    },
  });

  return data ?? null;
}
