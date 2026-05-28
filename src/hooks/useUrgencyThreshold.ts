import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";

const DEFAULT_THRESHOLD = 7;

export function isUrgente(desiredDate: string | null, thresholdDays: number): boolean {
  if (!desiredDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(desiredDate);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays <= thresholdDays;
}

export function useUrgencyThreshold() {
  const { companyId } = useViewRole();

  const { data: thresholdDays = DEFAULT_THRESHOLD } = useQuery({
    queryKey: ["urgency-threshold", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("urgente_threshold_days")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data?.urgente_threshold_days ?? DEFAULT_THRESHOLD;
    },
  });

  return thresholdDays;
}
