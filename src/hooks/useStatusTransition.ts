import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STATUS_LABELS, type RequestStatus, type RequestWithItems } from "@/lib/kanban-types";

export function useStatusTransition(companyId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ requestId, newStatus }: {
      requestId: string;
      newStatus: RequestStatus;
    }) => {
      const { error } = await supabase
        .from('requests')
        .update({ status: newStatus as any })
        .eq('id', requestId);
      if (error) throw error;

      await supabase.from('requerimiento_evento').insert({
        request_id: requestId,
        tipo: newStatus,
        descripcion: `Movido a ${STATUS_LABELS[newStatus]}`,
        created_by: user?.id ?? null,
      });
    },
    onMutate: async ({ requestId, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['requests', companyId] });

      const previousQueries: [readonly unknown[], RequestWithItems[] | undefined][] = [];
      queryClient.getQueriesData<RequestWithItems[]>({ queryKey: ['requests', companyId] })
        .forEach(([key, data]) => {
          previousQueries.push([key, data]);
        });

      queryClient.setQueriesData<RequestWithItems[]>(
        { queryKey: ['requests', companyId] },
        (old) => old?.map(r => r.id === requestId ? { ...r, status: newStatus } : r)
      );

      return { previousQueries };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', companyId] });
    },
  });
}
