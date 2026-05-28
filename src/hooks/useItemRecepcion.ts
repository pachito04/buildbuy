import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface RecepcionParams {
  requestId: string;
  itemId: string;
  materialName: string;
  unit: string;
  quantityReceived: number;
  newTotalReceived: number;
  totalRequired: number;
}

export function useItemRecepcion() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: RecepcionParams) => {
      const { requestId, itemId, materialName, unit, newTotalReceived, totalRequired } = params;

      const newStatus = newTotalReceived >= totalRequired ? "recibido" : "parcial";

      const { error: itemError } = await supabase
        .from("request_items")
        .update({
          quantity_received: newTotalReceived,
          status: newStatus as any,
        })
        .eq("id", itemId);
      if (itemError) throw itemError;

      await supabase.from("requerimiento_evento").insert({
        request_id: requestId,
        tipo: "recepcion_obra",
        descripcion: `Recepción en obra: ${params.quantityReceived} ${unit} de ${materialName}`,
        metadata: {
          item_id: itemId,
          quantity_received: params.quantityReceived,
          total_received: newTotalReceived,
          total_required: totalRequired,
          new_status: newStatus,
        },
        created_by: user?.id ?? null,
      });

      if (newStatus === "recibido") {
        const { data: allItems } = await supabase
          .from("request_items")
          .select("status")
          .eq("request_id", requestId);

        const allReceived = allItems?.every((i) => i.status === "recibido");
        if (allReceived) {
          await supabase
            .from("requests")
            .update({ status: "recibido" as any })
            .eq("id", requestId);

          await supabase.from("requerimiento_evento").insert({
            request_id: requestId,
            tipo: "procesado_total",
            descripcion: "Todos los ítems recibidos en obra",
            created_by: user?.id ?? null,
          });
        }
      }
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: ["request-detail", params.requestId] });
      queryClient.invalidateQueries({ queryKey: ["request-events", params.requestId] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
  });
}
