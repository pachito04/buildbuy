import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import type { Database } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CompanyLinkRow = Database["public"]["Tables"]["company_links"]["Row"];

export interface CompanyLinkWithNames extends CompanyLinkRow {
  requester_company: { id: string; name: string } | null;
  target_company: { id: string; name: string } | null;
}

export interface UseCompanyLinksResult {
  links: CompanyLinkWithNames[];
  isLoading: boolean;
  error: Error | null;
  /** Insert a new pending link from my company to targetCompanyId. */
  request: (targetCompanyId: string) => void;
  isRequesting: boolean;
  /** Accept an incoming pending link (update status → active). */
  accept: (linkId: string) => void;
  isAccepting: boolean;
  /** Disable an active link (update status → disabled). */
  disable: (linkId: string) => void;
  isDisabling: boolean;
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

const linksKey = (companyId: string | null) =>
  ["company-links", companyId] as const;

// ---------------------------------------------------------------------------
// Raw row shape from the Supabase join
// ---------------------------------------------------------------------------

interface RawLinkRow {
  id: string;
  requester_company_id: string;
  target_company_id: string;
  status: "pending" | "active" | "disabled";
  requested_by: string | null;
  accepted_by: string | null;
  created_at: string;
  updated_at: string;
  requester_company: { id: string; name: string } | null;
  target_company: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCompanyLinks(): UseCompanyLinksResult {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  // ---- Query ---------------------------------------------------------------

  const { data, isLoading, error } = useQuery({
    queryKey: linksKey(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<CompanyLinkWithNames[]> => {
      // Fetch all links where my company is either requester or target.
      // We join companies twice using aliased foreign keys for display names.
      const { data: rows, error: queryError } = await supabase
        .from("company_links")
        .select(
          `id,
           requester_company_id,
           target_company_id,
           status,
           requested_by,
           accepted_by,
           created_at,
           updated_at,
           requester_company:companies!company_links_requester_company_id_fkey(id, name),
           target_company:companies!company_links_target_company_id_fkey(id, name)`
        )
        .or(
          `requester_company_id.eq.${companyId},target_company_id.eq.${companyId}`
        )
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      return (rows ?? []) as unknown as CompanyLinkWithNames[];
    },
  });

  // ---- request mutation ----------------------------------------------------

  const requestMutation = useMutation({
    mutationFn: async (targetCompanyId: string) => {
      if (!companyId) throw new Error("No company_id available");
      if (!user?.id) throw new Error("Not authenticated");

      const { error: insertError } = await supabase
        .from("company_links")
        .insert({
          requester_company_id: companyId,
          target_company_id: targetCompanyId,
          status: "pending",
          requested_by: user.id,
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: linksKey(companyId) });
    },
    onError: (e: Error) => {
      console.error("[useCompanyLinks] request failed:", e.message);
    },
  });

  // ---- accept mutation -----------------------------------------------------

  const acceptMutation = useMutation({
    mutationFn: async (linkId: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error: updateError } = await supabase
        .from("company_links")
        .update({
          status: "active",
          accepted_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", linkId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: linksKey(companyId) });
    },
    onError: (e: Error) => {
      console.error("[useCompanyLinks] accept failed:", e.message);
    },
  });

  // ---- disable mutation ----------------------------------------------------

  const disableMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error: updateError } = await supabase
        .from("company_links")
        .update({
          status: "disabled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", linkId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: linksKey(companyId) });
    },
    onError: (e: Error) => {
      console.error("[useCompanyLinks] disable failed:", e.message);
    },
  });

  return {
    links: data ?? [],
    isLoading,
    error: error as Error | null,
    request: requestMutation.mutate,
    isRequesting: requestMutation.isPending,
    accept: acceptMutation.mutate,
    isAccepting: acceptMutation.isPending,
    disable: disableMutation.mutate,
    isDisabling: disableMutation.isPending,
  };
}
