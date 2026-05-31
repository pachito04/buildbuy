import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { linkRoleForCompany } from "@/lib/pool-foundation-utils";
import type { Database } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MaterialMappingRow =
  Database["public"]["Tables"]["material_mappings"]["Row"];
type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];

export interface MaterialMappingWithMaterials extends MaterialMappingRow {
  material_a: Pick<MaterialRow, "id" | "name" | "unit" | "sku"> | null;
  material_b: Pick<MaterialRow, "id" | "name" | "unit" | "sku"> | null;
}

export interface UseMateriaMappingsResult {
  mappings: MaterialMappingWithMaterials[];
  /** Own-company material catalog. */
  ownMaterials: MaterialRow[];
  /** Partner-company material catalog (readable via the active-link policy). */
  partnerMaterials: MaterialRow[];
  isLoading: boolean;
  error: Error | null;
  /**
   * Propose a new mapping (materialAId = requester's material, materialBId = target's material).
   * The proposing side's confirm flag is set true on insert.
   */
  propose: (materialAId: string, materialBId: string) => void;
  isProposing: boolean;
  /**
   * Confirm the other side's proposed mapping.
   * Determines which flag to set based on linkRoleForCompany.
   */
  confirm: (mappingId: string) => void;
  isConfirming: boolean;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const mappingsKey = (linkId: string | null) =>
  ["material-mappings", linkId] as const;

const ownMaterialsKey = (companyId: string | null) =>
  ["materials-own", companyId] as const;

const partnerMaterialsKey = (partnerCompanyId: string | null) =>
  ["materials-partner", partnerCompanyId] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useMaterialMappings — data and mutations for a single company_links row.
 *
 * @param linkId     The company_links.id to work with. Pass null to disable.
 * @param partnerCompanyId  The other company's id (used to filter partner materials).
 *                          Readable when an active link exists (via materials_select_linked_company policy).
 */
export function useMaterialMappings(
  linkId: string | null,
  partnerCompanyId: string | null
): UseMateriaMappingsResult {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  // ---- Mappings query ------------------------------------------------------

  const {
    data: mappings,
    isLoading: mappingsLoading,
    error: mappingsError,
  } = useQuery({
    queryKey: mappingsKey(linkId),
    enabled: !!linkId,
    queryFn: async (): Promise<MaterialMappingWithMaterials[]> => {
      const { data, error } = await supabase
        .from("material_mappings")
        .select(
          `id,
           company_link_id,
           material_a_id,
           material_b_id,
           confirmed_by_requester,
           confirmed_by_target,
           created_by,
           created_at,
           material_a:materials!material_mappings_material_a_id_fkey(id, name, unit, sku),
           material_b:materials!material_mappings_material_b_id_fkey(id, name, unit, sku)`
        )
        .eq("company_link_id", linkId!);

      if (error) throw error;
      return (data ?? []) as unknown as MaterialMappingWithMaterials[];
    },
  });

  // ---- Own materials query -------------------------------------------------

  const {
    data: ownMaterials,
    isLoading: ownLoading,
    error: ownError,
  } = useQuery({
    queryKey: ownMaterialsKey(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<MaterialRow[]> => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("name");

      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  // ---- Partner materials query ---------------------------------------------
  // The materials_select_linked_company policy makes these rows visible when
  // an active link exists between the viewer's company and partnerCompanyId.
  // If the link is not active or does not exist, the server returns 0 rows.

  const {
    data: partnerMaterials,
    isLoading: partnerLoading,
    error: partnerError,
  } = useQuery({
    queryKey: partnerMaterialsKey(partnerCompanyId),
    enabled: !!partnerCompanyId && !!linkId,
    queryFn: async (): Promise<MaterialRow[]> => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("company_id", partnerCompanyId!)
        .eq("active", true)
        .order("name");

      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  // ---- propose mutation ----------------------------------------------------

  const proposeMutation = useMutation({
    mutationFn: async ({
      materialAId,
      materialBId,
    }: {
      materialAId: string;
      materialBId: string;
    }) => {
      if (!linkId) throw new Error("No linkId");
      if (!companyId) throw new Error("No company_id");
      if (!user?.id) throw new Error("Not authenticated");

      // Determine which confirm flag to set based on the viewer's role.
      // We need the link's requester/target to call linkRoleForCompany.
      // The link row must already be loaded by the caller's context;
      // we re-fetch it minimally here to avoid passing it as a parameter.
      const { data: linkRow, error: linkError } = await supabase
        .from("company_links")
        .select("requester_company_id, target_company_id")
        .eq("id", linkId)
        .single();

      if (linkError) throw linkError;

      const role = linkRoleForCompany(
        linkRow as { requester_company_id: string; target_company_id: string },
        companyId
      );

      const payload: {
        company_link_id: string;
        material_a_id: string;
        material_b_id: string;
        created_by: string;
        confirmed_by_requester: boolean;
        confirmed_by_target: boolean;
      } = {
        company_link_id: linkId,
        material_a_id: materialAId,
        material_b_id: materialBId,
        created_by: user.id,
        confirmed_by_requester: role === "requester",
        confirmed_by_target: role === "target",
      };

      const { error: insertError } = await supabase
        .from("material_mappings")
        .insert(payload);

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mappingsKey(linkId) });
    },
    onError: (e: Error) => {
      console.error("[useMaterialMappings] propose failed:", e.message);
    },
  });

  // ---- confirm mutation ----------------------------------------------------

  const confirmMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      if (!companyId) throw new Error("No company_id");

      // Re-fetch the link to determine role.
      const { data: linkRow, error: linkError } = await supabase
        .from("company_links")
        .select("requester_company_id, target_company_id")
        .eq("id", linkId!)
        .single();

      if (linkError) throw linkError;

      const role = linkRoleForCompany(
        linkRow as { requester_company_id: string; target_company_id: string },
        companyId
      );

      if (!role) throw new Error("Viewer is not a party of this link");

      const updatePayload =
        role === "requester"
          ? { confirmed_by_requester: true }
          : { confirmed_by_target: true };

      const { error: updateError } = await supabase
        .from("material_mappings")
        .update(updatePayload)
        .eq("id", mappingId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mappingsKey(linkId) });
    },
    onError: (e: Error) => {
      console.error("[useMaterialMappings] confirm failed:", e.message);
    },
  });

  const isLoading = mappingsLoading || ownLoading || partnerLoading;
  const error =
    (mappingsError as Error | null) ??
    (ownError as Error | null) ??
    (partnerError as Error | null);

  return {
    mappings: mappings ?? [],
    ownMaterials: ownMaterials ?? [],
    partnerMaterials: partnerMaterials ?? [],
    isLoading,
    error,
    propose: (materialAId: string, materialBId: string) =>
      proposeMutation.mutate({ materialAId, materialBId }),
    isProposing: proposeMutation.isPending,
    confirm: confirmMutation.mutate,
    isConfirming: confirmMutation.isPending,
  };
}
