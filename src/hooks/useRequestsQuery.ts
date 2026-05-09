import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RequestWithItems } from "@/lib/kanban-types";

export function useRequestsQuery(companyId: string | null, obraId?: string) {
  return useQuery({
    queryKey: ['requests', companyId, obraId ?? 'all'],
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from('requests')
        .select(`
          *,
          request_items(*),
          architects:architect_id(full_name),
          projects:project_id(id, name)
        `)
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });

      if (obraId) {
        query = query.eq('project_id', obraId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as RequestWithItems[];
    },
  });
}
