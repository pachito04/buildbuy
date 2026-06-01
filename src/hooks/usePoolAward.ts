/**
 * usePoolAward.ts
 *
 * Data and mutations for the pool award (adjudicación) flow (#9c — Slice 2).
 *
 * Responsibilities:
 *  - Exposes the shared comparativa: pool RFQ + all quotes + quote_items +
 *    rfq_items + pool_items + pool_item_contributions (visible via AD-1 RLS).
 *  - adjudicate(poolId, winningQuoteId) — persist the winner on purchase_pools
 *    (winning_quote_id + pool_state = 'adjudicado') via the member-writable
 *    purchase_pools_member_update RLS policy. Does NOT touch quotes.status.
 *  - generateMyOc(poolId) — build this company's OC lines via companyOcLines,
 *    INSERT purchase_orders + purchase_order_items. Guard against double-generation.
 *  - After generateMyOc, check if every member company has a PO for the pool
 *    RFQ; if so, advance pool_state to 'cerrado'.
 *
 * Schema note: purchase_pools.winning_quote_id (uuid FK → quotes.id) is the
 * authoritative winner record. It is set in a single UPDATE that pool members
 * can perform (purchase_pools_member_update policy). The quotes.status column
 * is NOT used for winner persistence — only the provider's own
 * quotes_provider_update policy can mutate it, and buyers/members are not that
 * actor.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import {
  companyOcLines,
  type WinningLine,
  type MyContribution,
} from "@/lib/pool-award-utils";

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

const poolRfqKey = (poolId: string | null) =>
  ["pool-rfq", poolId] as const;

const poolComparativaKey = (poolId: string | null) =>
  ["pool-comparativa", poolId] as const;

// ---------------------------------------------------------------------------
// Row-shape helpers
// ---------------------------------------------------------------------------

/** Minimal rfq row as returned by the pool RFQ query. */
interface PoolRfqRow {
  id: string;
  pool_id: string | null;
  status: string;
  company_id: string;
}

/** Minimal purchase_pools row — winner resolution only. */
interface PoolWinnerRow {
  winning_quote_id: string | null;
}

/** Quote row enriched with its items (joined). */
interface QuoteRow {
  id: string;
  rfq_id: string;
  provider_id: string;
  total_price: number | null;
  status: string;
  conditions: string | null;
  delivery_days: number | null;
  quote_items: QuoteItemRow[];
}

interface QuoteItemRow {
  id: string;
  quote_id: string;
  rfq_item_id: string;
  unit_price: number;
  rfq_items: RfqItemRow | null;
}

interface RfqItemRow {
  id: string;
  rfq_id: string;
  material_id: string | null;
  description: string;
  unit: string;
  quantity: number;
}

/** Pool item row. */
interface PoolItemRow {
  id: string;
  pool_id: string;
  material_id: string | null;
  description: string;
  unit: string;
  total_quantity: number;
}

/** Pool item contribution row. */
interface PoolItemContributionRow {
  id: string;
  pool_item_id: string;
  company_id: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Hook result type
// ---------------------------------------------------------------------------

export interface UsePoolAwardResult {
  /** The pool's shared RFQ (null while loading or if not yet generated). */
  poolRfq: PoolRfqRow | null;

  /** All quotes (with nested quote_items + rfq_items) for the pool RFQ. */
  quotes: QuoteRow[];

  /** Consolidated pool items. */
  poolItems: PoolItemRow[];

  /** All per-company contributions for this pool. */
  contributions: PoolItemContributionRow[];

  /**
   * The winning quote id as stored on purchase_pools.winning_quote_id.
   * Null before adjudication or while loading.
   */
  winningQuoteId: string | null;

  isLoading: boolean;
  error: Error | null;

  /**
   * Persist the winning quote on purchase_pools (winning_quote_id) and advance
   * pool_state to 'adjudicado' in a single UPDATE. Uses the member-writable
   * purchase_pools_member_update RLS policy. Does NOT touch quotes.status.
   * Subsequent calls on an already-adjudicado pool are idempotent.
   */
  adjudicate: (poolId: string, winningQuoteId: string) => Promise<void>;
  isAdjudicating: boolean;

  /**
   * Generate THIS company's purchase order from the pool award.
   * Resolves the winning quote via purchase_pools.winning_quote_id, then
   * loads quote_items + rfq_items → companyOcLines →
   * INSERT purchase_orders + purchase_order_items.
   * Guard: if this company already has a PO for the pool RFQ, this is a no-op.
   * After inserting, checks if all member companies have POs; if so sets
   * pool_state to 'cerrado'.
   */
  generateMyOc: (poolId: string) => Promise<void>;
  isGeneratingOc: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePoolAward(poolId: string | null): UsePoolAwardResult {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  // ---- pool RFQ query -------------------------------------------------------
  // Fetches the rfq row where pool_id = poolId (there is at most one per pool,
  // created by generateSharedRfq in #9b). Visible to all pool members via AD-1.

  const {
    data: poolRfqData,
    isLoading: isLoadingRfq,
    error: rfqError,
  } = useQuery({
    queryKey: poolRfqKey(poolId),
    enabled: !!poolId,
    queryFn: async (): Promise<PoolRfqRow | null> => {
      const { data, error } = await supabase
        .from("rfqs")
        .select("id, pool_id, status, company_id")
        .eq("pool_id", poolId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PoolRfqRow | null;
    },
  });

  const rfqId = poolRfqData?.id ?? null;

  // ---- pool winner query ----------------------------------------------------
  // Reads purchase_pools.winning_quote_id so the UI can highlight the winner
  // without relying on quotes.status (which is provider-writable only).

  const { data: poolWinnerData, isLoading: isLoadingWinner } = useQuery({
    queryKey: ["pool-winner", poolId] as const,
    enabled: !!poolId,
    queryFn: async (): Promise<PoolWinnerRow | null> => {
      const { data, error } = await supabase
        .from("purchase_pools")
        .select("winning_quote_id")
        .eq("id", poolId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PoolWinnerRow | null;
    },
  });

  const winningQuoteId = poolWinnerData?.winning_quote_id ?? null;

  // ---- shared comparativa query --------------------------------------------
  // Fetches quotes + quote_items (nested) + rfq_items (nested) for the pool
  // RFQ. Enabled only once we have the rfqId. Visible to pool members via AD-1.

  const {
    data: comparativaData,
    isLoading: isLoadingComparativa,
    error: comparativaError,
  } = useQuery({
    queryKey: poolComparativaKey(poolId),
    enabled: !!rfqId,
    queryFn: async (): Promise<{
      quotes: QuoteRow[];
      poolItems: PoolItemRow[];
      contributions: PoolItemContributionRow[];
    }> => {
      // Quotes + nested items in one shot (RLS via AD-1 allows pool members).
      const { data: quotesRaw, error: quotesErr } = await supabase
        .from("quotes")
        .select(
          `id, rfq_id, provider_id, total_price, status, conditions, delivery_days,
           quote_items(
             id, quote_id, rfq_item_id, unit_price,
             rfq_items(id, rfq_id, material_id, description, unit, quantity)
           )`
        )
        .eq("rfq_id", rfqId!);
      if (quotesErr) throw quotesErr;

      // Pool items for this pool.
      const { data: itemsRaw, error: itemsErr } = await supabase
        .from("pool_items")
        .select("id, pool_id, material_id, description, unit, total_quantity")
        .eq("pool_id", poolId!);
      if (itemsErr) throw itemsErr;

      // All pool_item_contributions for items in this pool.
      const { data: contribsRaw, error: contribsErr } = await supabase
        .from("pool_item_contributions")
        .select(
          `id, pool_item_id, company_id, quantity,
           pool_items!inner(pool_id)`
        )
        .eq("pool_items.pool_id", poolId!);
      if (contribsErr) throw contribsErr;

      const quotes = (quotesRaw ?? []).map((q: any): QuoteRow => ({
        id: q.id,
        rfq_id: q.rfq_id,
        provider_id: q.provider_id,
        total_price: q.total_price,
        status: q.status,
        conditions: q.conditions,
        delivery_days: q.delivery_days,
        quote_items: (q.quote_items ?? []).map((qi: any): QuoteItemRow => ({
          id: qi.id,
          quote_id: qi.quote_id,
          rfq_item_id: qi.rfq_item_id,
          unit_price: qi.unit_price,
          rfq_items: qi.rfq_items
            ? {
                id: qi.rfq_items.id,
                rfq_id: qi.rfq_items.rfq_id,
                material_id: qi.rfq_items.material_id,
                description: qi.rfq_items.description,
                unit: qi.rfq_items.unit,
                quantity: qi.rfq_items.quantity,
              }
            : null,
        })),
      }));

      const poolItems = (itemsRaw ?? []) as PoolItemRow[];

      const contributions = (contribsRaw ?? []).map(
        (c: any): PoolItemContributionRow => ({
          id: c.id,
          pool_item_id: c.pool_item_id,
          company_id: c.company_id,
          quantity: c.quantity,
        })
      );

      return { quotes, poolItems, contributions };
    },
  });

  // ---- adjudicate mutation --------------------------------------------------

  const adjudicateMutation = useMutation({
    mutationFn: async ({
      poolId,
      winningQuoteId,
    }: {
      poolId: string;
      winningQuoteId: string;
    }) => {
      // Persist the winner and advance pool_state in one atomic UPDATE on
      // purchase_pools. Pool members have UPDATE permission via the
      // purchase_pools_member_update RLS policy, so this works for any member.
      // We deliberately do NOT touch quotes.status: the only UPDATE policy on
      // quotes is quotes_provider_update (provider-scoped), so a buyer/member
      // cannot mutate it. Winner persistence lives on purchase_pools only.
      const { error: poolErr } = await supabase
        .from("purchase_pools")
        .update({ winning_quote_id: winningQuoteId, pool_state: "adjudicado" })
        .eq("id", poolId);
      if (poolErr) throw poolErr;
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: ["pool-winner", poolId] });
      qc.invalidateQueries({ queryKey: poolRfqKey(poolId) });
      qc.invalidateQueries({ queryKey: poolComparativaKey(poolId) });
    },
    onError: (e: Error) => {
      console.error("[usePoolAward] adjudicate failed:", e.message);
    },
  });

  // ---- generateMyOc mutation ------------------------------------------------

  const generateOcMutation = useMutation({
    mutationFn: async ({ poolId }: { poolId: string }) => {
      if (!companyId) throw new Error("No company_id");
      if (!user?.id) throw new Error("Not authenticated");

      // Step 1: Find the pool RFQ.
      const { data: rfqRow, error: rfqErr } = await supabase
        .from("rfqs")
        .select("id, pool_id, status")
        .eq("pool_id", poolId)
        .limit(1)
        .maybeSingle();
      if (rfqErr) throw rfqErr;
      if (!rfqRow) {
        throw new Error(
          "No shared RFQ found for this pool. Run generateSharedRfq first."
        );
      }
      const rfqId = (rfqRow as { id: string }).id;

      // Step 2: Guard — check if this company already has a PO for the pool RFQ.
      const { data: existingPo, error: guardErr } = await supabase
        .from("purchase_orders")
        .select("id")
        .eq("rfq_id", rfqId)
        .eq("company_id", companyId)
        .limit(1)
        .maybeSingle();
      if (guardErr) throw guardErr;
      if (existingPo) {
        // Already generated — no-op.
        return;
      }

      // Step 3: Resolve the winning quote via purchase_pools.winning_quote_id.
      // This is safe for pool members (purchase_pools_member_update / SELECT
      // policies cover pool members). We deliberately avoid querying
      // quotes.status='awarded' — that column can only be written by the
      // provider that owns the quote (quotes_provider_update policy), so it
      // would always be null after adjudication by a buyer/member.
      const { data: poolRow, error: poolReadErr } = await supabase
        .from("purchase_pools")
        .select("winning_quote_id")
        .eq("id", poolId)
        .limit(1)
        .maybeSingle();
      if (poolReadErr) throw poolReadErr;
      if (!poolRow?.winning_quote_id) {
        throw new Error(
          "No winning quote found. Adjudicate the pool before generating an OC."
        );
      }
      const resolvedWinningQuoteId = poolRow.winning_quote_id as string;

      // Load the winning quote + its items (joins to rfq_items for material details).
      const { data: winningQuoteRow, error: wqErr } = await supabase
        .from("quotes")
        .select(
          `id, provider_id, total_price,
           quote_items(
             id, rfq_item_id, unit_price,
             rfq_items(id, material_id, description, unit, quantity)
           )`
        )
        .eq("id", resolvedWinningQuoteId)
        .limit(1)
        .maybeSingle();
      if (wqErr) throw wqErr;
      if (!winningQuoteRow) {
        throw new Error(
          "Winning quote not found in database. Data integrity issue."
        );
      }
      const wq = winningQuoteRow as any;

      // Step 4: Build WinningLine[] from quote_items → rfq_items.
      const winningLines: WinningLine[] = (wq.quote_items ?? [])
        .filter((qi: any) => qi.rfq_items?.material_id != null)
        .map(
          (qi: any): WinningLine => ({
            material_id: qi.rfq_items.material_id as string,
            description: qi.rfq_items.description as string,
            unit: qi.rfq_items.unit as string,
            unit_price: Number(qi.unit_price),
          })
        );

      // Step 5: Resolve MY company's contributions for this pool.
      // pool_item_contributions → joined to pool_items by pool_id → filter by company_id.
      const { data: contribRows, error: contribErr } = await supabase
        .from("pool_item_contributions")
        .select(
          `quantity, pool_items!inner(material_id, pool_id)`
        )
        .eq("company_id", companyId)
        .eq("pool_items.pool_id", poolId);
      if (contribErr) throw contribErr;

      const myContribs: MyContribution[] = (contribRows ?? [])
        .filter((c: any) => c.pool_items?.material_id != null)
        .map(
          (c: any): MyContribution => ({
            material_id: c.pool_items.material_id as string,
            quantity: Number(c.quantity),
          })
        );

      // Step 6: Compute OC lines via the pure split utility.
      const ocLines = companyOcLines(winningLines, myContribs);

      if (ocLines.length === 0) {
        throw new Error(
          "No OC lines to generate: this company has no contributions matching the awarded items."
        );
      }

      // Step 7: Compute total_amount = sum of (quantity * unit_price).
      const totalAmount = ocLines.reduce(
        (sum, line) => sum + line.quantity * line.unit_price,
        0
      );

      // Step 8: INSERT purchase_orders.
      const { data: poRow, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId,
          provider_id: wq.provider_id as string,
          rfq_id: rfqId,
          total_amount: totalAmount,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (poErr) throw poErr;

      const poId = (poRow as { id: string }).id;

      // Step 9: INSERT purchase_order_items (one per OC line).
      const poItems = ocLines.map((line) => ({
        purchase_order_id: poId,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        material_id: line.material_id,
      }));

      const { error: poItemsErr } = await supabase
        .from("purchase_order_items")
        .insert(poItems);
      if (poItemsErr) throw poItemsErr;

      // Step 10: Check if ALL member companies now have a PO for the pool RFQ.
      // Fetch all member company_ids from pool_companies.
      const { data: memberRows, error: memberErr } = await supabase
        .from("pool_companies")
        .select("company_id")
        .eq("pool_id", poolId);
      if (memberErr) throw memberErr;

      const memberIds = (memberRows ?? []).map(
        (r: { company_id: string }) => r.company_id
      );

      // Fetch all POs for the pool RFQ, one per company.
      const { data: poRows, error: poListErr } = await supabase
        .from("purchase_orders")
        .select("company_id")
        .eq("rfq_id", rfqId);
      if (poListErr) throw poListErr;

      const companiesWithPo = new Set(
        (poRows ?? []).map((r: { company_id: string }) => r.company_id)
      );

      const allMembersHavePo =
        memberIds.length > 0 &&
        memberIds.every((id) => companiesWithPo.has(id));

      if (allMembersHavePo) {
        const { error: cerradoErr } = await supabase
          .from("purchase_pools")
          .update({ pool_state: "cerrado" })
          .eq("id", poolId);
        if (cerradoErr) throw cerradoErr;
      }
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: poolRfqKey(poolId) });
      qc.invalidateQueries({ queryKey: poolComparativaKey(poolId) });
    },
    onError: (e: Error) => {
      console.error("[usePoolAward] generateMyOc failed:", e.message);
    },
  });

  // ---- Public surface -------------------------------------------------------

  const isLoading = isLoadingRfq || isLoadingComparativa || isLoadingWinner;
  const error = (rfqError ?? comparativaError) as Error | null;

  return {
    poolRfq: poolRfqData ?? null,
    quotes: comparativaData?.quotes ?? [],
    poolItems: comparativaData?.poolItems ?? [],
    contributions: comparativaData?.contributions ?? [],
    winningQuoteId,
    isLoading,
    error,

    adjudicate: async (poolId, winningQuoteId) => {
      await adjudicateMutation.mutateAsync({ poolId, winningQuoteId });
    },
    isAdjudicating: adjudicateMutation.isPending,

    generateMyOc: async (poolId) => {
      await generateOcMutation.mutateAsync({ poolId });
    },
    isGeneratingOc: generateOcMutation.isPending,
  };
}
