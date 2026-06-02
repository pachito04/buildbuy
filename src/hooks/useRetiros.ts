import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useViewRole } from '@/hooks/useViewRole';
import { useToast } from '@/hooks/use-toast';
import type { Database, Json } from '@/integrations/supabase/types';
import type { RetiroItemPayload } from '@/lib/retiro';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RetiroRow = Database['public']['Tables']['retiro']['Row'];

export type RetiroWithItems = RetiroRow & {
  retiro_item: Array<{
    id: string;
    material_id: string;
    cantidad: number;
    precio_unitario_aplicado: number;
    subtotal: number;
    material: { id: string; name: string; unit: string } | null;
  }>;
  provider: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  architect: { id: string; full_name: string } | null;
};

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const retirosKey = (providerId?: string | null, projectId?: string | null) =>
  ['retiros', providerId ?? null, projectId ?? null] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRetiros(providerId?: string | null, projectId?: string | null) {
  const { companyId } = useViewRole();
  const qc = useQueryClient();
  const { toast } = useToast();

  // ---- List query ------------------------------------------------------------

  const {
    data: retiros,
    isLoading,
    error,
  } = useQuery({
    queryKey: retirosKey(providerId, projectId),
    enabled: true,
    queryFn: async (): Promise<RetiroWithItems[]> => {
      let query = supabase
        .from('retiro')
        .select(
          `id, company_id, provider_id, project_id, architect_id,
           fecha_retiro, fecha_registro, observaciones, estado,
           anulado_por, fecha_anulacion, motivo_anulacion, created_by, created_at,
           retiro_item(
             id, material_id, cantidad, precio_unitario_aplicado, subtotal,
             material:materials!retiro_item_material_id_fkey(id, name, unit)
           ),
           provider:providers!retiro_provider_id_fkey(id, name),
           project:projects!retiro_project_id_fkey(id, name),
           architect:architects!retiro_architect_id_fkey(id, full_name)`
        )
        .order('fecha_retiro', { ascending: false });

      if (providerId) query = query.eq('provider_id', providerId);
      if (projectId) query = query.eq('project_id', projectId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as RetiroWithItems[];
    },
  });

  // ---- registrarRetiro mutation ----------------------------------------------

  const registrarMutation = useMutation({
    mutationFn: async (params: {
      provider_id: string;
      project_id: string;
      architect_id: string;
      fecha_retiro: string;
      items: RetiroItemPayload[];
      observaciones?: string;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('registrar_retiro', {
        p_provider_id: params.provider_id,
        p_project_id: params.project_id,
        p_architect_id: params.architect_id,
        p_fecha_retiro: params.fecha_retiro,
        p_items: params.items as unknown as Json,
        p_observaciones: params.observaciones,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retiros'] });
      qc.invalidateQueries({ queryKey: ['movimientos-cc'] });
      toast({ title: 'Retiro registrado correctamente.' });
    },
    onError: (e: Error) => {
      toast({
        title: 'Error al registrar retiro',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  // ---- anularRetiro mutation -------------------------------------------------

  const anularMutation = useMutation({
    mutationFn: async (params: { retiro_id: string; motivo: string }): Promise<void> => {
      const { error } = await supabase.rpc('anular_retiro', {
        p_retiro_id: params.retiro_id,
        p_motivo: params.motivo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retiros'] });
      qc.invalidateQueries({ queryKey: ['movimientos-cc'] });
      toast({ title: 'Retiro anulado. Se generó el crédito compensatorio.' });
    },
    onError: (e: Error) => {
      toast({
        title: 'Error al anular retiro',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  return {
    retiros: retiros ?? [],
    isLoading,
    error: error as Error | null,
    registrarRetiro: registrarMutation.mutate,
    isRegistrando: registrarMutation.isPending,
    anularRetiro: anularMutation.mutate,
    isAnulando: anularMutation.isPending,
  };
}
