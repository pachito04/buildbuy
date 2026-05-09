import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  calcularKPIs,
  agruparPorRubro,
  type ComputoAvanceItem,
  type ObraKPIs,
  type RubroAvance,
} from "@/lib/computo-utils";

interface ObraDashboardData {
  items: ComputoAvanceItem[];
  kpis: ObraKPIs;
  rubros: RubroAvance[];
  hasComputo: boolean;
  sinPrecios: boolean;
}

export function useObraDashboard(projectId: string | undefined) {
  return useQuery({
    queryKey: ["obra-dashboard", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ObraDashboardData> => {
      const { data, error } = await supabase
        .from("v_computo_avance")
        .select("*")
        .eq("project_id", projectId!);

      if (error) throw error;

      const items = (data ?? []) as ComputoAvanceItem[];
      const hasComputo = items.length > 0;
      const sinPrecios = hasComputo && items.every(i => Number(i.precio_unit_estimado) === 0);
      const kpis = calcularKPIs(items);
      const rubros = agruparPorRubro(items);

      return { items, kpis, rubros, hasComputo, sinPrecios };
    },
  });
}
