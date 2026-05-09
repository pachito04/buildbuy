import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useRejectionMutation(companyId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ requestId, reason, note }: {
      requestId: string;
      reason: string;
      note: string | null;
    }) => {
      const { error } = await supabase
        .from('requests')
        .update({
          status: 'rechazado' as any,
          motivo_rechazo: reason,
          nota_rechazo: note,
          rechazado_at: new Date().toISOString(),
          rechazado_by: user?.id ?? null,
        })
        .eq('id', requestId);
      if (error) throw error;

      try {
        await supabase.from('requerimiento_evento').insert({
          request_id: requestId,
          tipo: 'rechazado',
          descripcion: reason,
          metadata: { nota: note },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error('Failed to insert rejection event:', eventError);
      }
    },
    onSuccess: (_data, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: ['requests', companyId] });
      queryClient.invalidateQueries({ queryKey: ['request-detail', requestId] });
      queryClient.invalidateQueries({ queryKey: ['request-events', requestId] });
    },
  });
}
