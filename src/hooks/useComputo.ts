import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useComputo(projectId: string | undefined) {
  return useQuery({
    queryKey: ["computo", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data: computo, error } = await supabase
        .from("computo")
        .select("*")
        .eq("project_id", projectId!)
        .eq("activo", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!computo) return null;

      const { data: items, error: itemsError } = await supabase
        .from("computo_item")
        .select("*, materials:material_id(name, unit)")
        .eq("computo_id", computo.id)
        .order("rubro")
        .order("orden_dentro_rubro");

      if (itemsError) throw itemsError;

      return { ...computo, items: items ?? [] };
    },
  });
}
