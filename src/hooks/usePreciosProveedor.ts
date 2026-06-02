import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewRole } from '@/hooks/useViewRole';
import { hasVigenciaOverlap } from '@/lib/precio-vigencia';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PrecioRow = Database['public']['Tables']['precio_proveedor']['Row'];
type PrecioInsert = Database['public']['Tables']['precio_proveedor']['Insert'];

export type PrecioWithMaterial = PrecioRow & {
  material: { id: string; name: string; unit: string } | null;
};

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const preciosKey = (providerId: string | null, companyId: string | null) =>
  ['precios-proveedor', providerId, companyId] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * usePreciosProveedor — list + insert + close-vigencia for precio_proveedor.
 *
 * @param providerId  When null, query is disabled. Pass the provider to manage.
 */
export function usePreciosProveedor(providerId: string | null) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();
  const { toast } = useToast();

  // ---- List query -----------------------------------------------------------

  const {
    data: precios,
    isLoading,
    error,
  } = useQuery({
    queryKey: preciosKey(providerId, companyId),
    enabled: !!providerId,
    queryFn: async (): Promise<PrecioWithMaterial[]> => {
      const { data, error } = await supabase
        .from('precio_proveedor')
        .select(
          `id,
           company_id,
           provider_id,
           material_id,
           precio_unitario,
           unidad_medida,
           vigencia_desde,
           vigencia_hasta,
           created_by,
           created_at,
           material:materials!precio_proveedor_material_id_fkey(id, name, unit)`
        )
        .eq('provider_id', providerId!)
        .order('vigencia_desde', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as PrecioWithMaterial[];
    },
  });

  // ---- Insert mutation (with client-side overlap guard) --------------------

  const insertMutation = useMutation({
    mutationFn: async (
      payload: Omit<PrecioInsert, 'created_by'>
    ): Promise<void> => {
      if (!user?.id) throw new Error('Not authenticated');

      // Client-side guard: check overlap before hitting the server.
      const existing = (precios ?? []) as PrecioRow[];
      if (hasVigenciaOverlap(existing, payload as PrecioRow)) {
        throw new Error(
          'La vigencia indicada se superpone con un precio existente para ese material y proveedor.'
        );
      }

      const { error } = await supabase.from('precio_proveedor').insert({
        ...payload,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: preciosKey(providerId, companyId) });
      toast({ title: 'Precio registrado correctamente.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Error al registrar precio', description: e.message, variant: 'destructive' });
    },
  });

  // ---- Close vigencia (set vigencia_hasta) ---------------------------------

  const closeVigenciaMutation = useMutation({
    mutationFn: async ({
      id,
      vigencia_hasta,
    }: {
      id: string;
      vigencia_hasta: string;
    }): Promise<void> => {
      const { error } = await supabase
        .from('precio_proveedor')
        .update({ vigencia_hasta })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: preciosKey(providerId, companyId) });
      toast({ title: 'Vigencia cerrada correctamente.' });
    },
    onError: (e: Error) => {
      toast({
        title: 'Error al cerrar vigencia',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  // ---- Delete mutation -----------------------------------------------------
  // Only removes records — not allowed on movimiento_cuenta_corriente but
  // precio_proveedor has no such restriction.

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('precio_proveedor')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: preciosKey(providerId, companyId) });
      toast({ title: 'Precio eliminado.' });
    },
    onError: (e: Error) => {
      toast({
        title: 'Error al eliminar precio',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  return {
    precios: precios ?? [],
    isLoading,
    error: error as Error | null,
    insertPrecio: insertMutation.mutate,
    isInserting: insertMutation.isPending,
    closeVigencia: closeVigenciaMutation.mutate,
    isClosing: closeVigenciaMutation.isPending,
    deletePrecio: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
