import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ObraAvanceResumen {
  presupuesto: number;
  comprometido: number;
  recibido: number;
  itemCount: number;
}

export function useObrasAvance(companyId: string | null) {
  return useQuery({
    queryKey: ["obras-avance", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_computo_avance")
        .select("project_id, subtotal_estimado, monto_pedido, monto_recibido");

      if (error) throw error;

      const map = new Map<string, ObraAvanceResumen>();
      for (const row of data ?? []) {
        const existing = map.get(row.project_id);
        if (existing) {
          existing.presupuesto += Number(row.subtotal_estimado);
          existing.comprometido += Number(row.monto_pedido);
          existing.recibido += Number(row.monto_recibido);
          existing.itemCount += 1;
        } else {
          map.set(row.project_id, {
            presupuesto: Number(row.subtotal_estimado),
            comprometido: Number(row.monto_pedido),
            recibido: Number(row.monto_recibido),
            itemCount: 1,
          });
        }
      }
      return map;
    },
  });
}
