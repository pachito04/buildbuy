import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewRole } from '@/hooks/useViewRole';
import { useToast } from '@/hooks/use-toast';
import { computeSaldo, filterMovimientos } from '@/lib/cuenta-corriente';
import type { MovimientoRow, FilterMovimientosOptions } from '@/lib/cuenta-corriente';
import type { Database } from '@/integrations/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MovimientoInsert = Database['public']['Tables']['movimiento_cuenta_corriente']['Insert'];

export type MovimientoWithRetiro = MovimientoRow & {
  retiro?: {
    id: string;
    project_id: string;
    project: { id: string; name: string } | null;
  } | null;
};

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const movimientosKey = (providerId?: string | null) =>
  ['movimientos-cc', providerId ?? null] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCuentaCorriente(providerId?: string | null) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();
  const { toast } = useToast();

  // ---- List query ------------------------------------------------------------

  const {
    data: movimientos,
    isLoading,
    error,
  } = useQuery({
    queryKey: movimientosKey(providerId),
    enabled: !!providerId,
    queryFn: async (): Promise<MovimientoWithRetiro[]> => {
      const { data, error } = await supabase
        .from('movimiento_cuenta_corriente')
        .select(
          `id, company_id, provider_id, tipo, retiro_id, monto, fecha,
           concepto, medio_pago, referencia, created_by, created_at,
           retiro:retiro!movimiento_cuenta_corriente_retiro_id_fkey(
             id, project_id,
             project:projects!retiro_project_id_fkey(id, name)
           )`
        )
        .eq('provider_id', providerId!)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Normalize: attach project_id from retiro to top-level for filter convenience
      const normalized = (data ?? []).map((row: any) => ({
        ...row,
        project_id: row.retiro?.project_id ?? null,
      }));
      return normalized as MovimientoWithRetiro[];
    },
  });

  // ---- Derived: saldo and filtered list ------------------------------------

  function getSaldo(filters?: FilterMovimientosOptions): number {
    const base = movimientos ?? [];
    const filtered = filters ? filterMovimientos(base as MovimientoRow[], filters) : base;
    return computeSaldo(filtered as MovimientoRow[]);
  }

  function getFiltered(filters: FilterMovimientosOptions): MovimientoWithRetiro[] {
    const base = movimientos ?? [];
    return filterMovimientos(base as MovimientoRow[], filters) as MovimientoWithRetiro[];
  }

  // ---- registrarMovimientoManual (pago / nota de crédito) ------------------

  const registrarManualMutation = useMutation({
    mutationFn: async (params: {
      provider_id: string;
      company_id: string;
      monto: number;
      concepto: string;
      tipo: 'credito' | 'debito';
      medio_pago?: string;
      referencia?: string;
      fecha?: string;
    }): Promise<void> => {
      if (!user?.id) throw new Error('No autenticado');

      const payload: MovimientoInsert = {
        provider_id: params.provider_id,
        company_id: params.company_id,
        tipo: params.tipo,
        monto: params.monto,
        concepto: params.concepto,
        medio_pago: params.medio_pago ?? null,
        referencia: params.referencia ?? null,
        fecha: params.fecha ?? new Date().toISOString().split('T')[0],
        retiro_id: null,
        created_by: user.id,
      };

      const { error } = await supabase.from('movimiento_cuenta_corriente').insert(payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: movimientosKey(providerId) });
      toast({ title: 'Movimiento registrado correctamente.' });
    },
    onError: (e: Error) => {
      toast({
        title: 'Error al registrar movimiento',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  return {
    movimientos: movimientos ?? [],
    isLoading,
    error: error as Error | null,
    computeSaldo: getSaldo,
    filterMovimientos: getFiltered,
    registrarMovimientoManual: registrarManualMutation.mutate,
    isRegistrando: registrarManualMutation.isPending,
  };
}
