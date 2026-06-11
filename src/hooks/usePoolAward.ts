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
  groupAwardsByProvider,
  type WinningLine,
  type MyContribution,
  type QuoteItemWithProvider,
  type PoolCompanyAward,
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

/** Minimal purchase_pools row — winner resolution + award_mode. */
interface PoolWinnerRow {
  winning_quote_id: string | null;
  award_mode: "leader" | "per_company";
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
   * Null before adjudication or while loading (Mode A only).
   */
  winningQuoteId: string | null;

  /**
   * Award mode from purchase_pools.award_mode.
   * 'leader' = Mode A (default); 'per_company' = Mode B.
   */
  awardMode: "leader" | "per_company";

  isLoading: boolean;
  error: Error | null;

  /**
   * Mode A only. Persist the winning quote on purchase_pools (winning_quote_id)
   * and advance pool_state to 'adjudicado'. Does NOT touch quotes.status.
   */
  adjudicate: (poolId: string, winningQuoteId: string) => Promise<void>;
  isAdjudicating: boolean;

  /**
   * Mode B only. UPSERT this company's per-item awards into pool_company_awards,
   * then call pool_finalize_award_mode_b RPC. Never writes winning_quote_id.
   */
  confirmMyAward: (
    poolId: string,
    awards: { rfqItemId: string; quoteItemId: string }[]
  ) => Promise<void>;
  isConfirmingAward: boolean;

  /**
   * Generate THIS company's purchase order from the pool award.
   *
   * Mode A: reads winning_quote_id from purchase_pools → one OC.
   * Mode B: reads pool_company_awards for this company → groups by provider
   *         → inserts one OC per provider.
   *
   * Guard (Mode A): if company already has a PO for the pool RFQ → no-op.
   * Guard (Mode B): if company already has a PO for (rfq_id, provider_id) → skip that OC.
   */
  generateMyOc: (poolId: string) => Promise<void>;
  isGeneratingOc: boolean;
}

// ---------------------------------------------------------------------------
// Internal helper (not exported)
// ---------------------------------------------------------------------------

/**
 * After generating an OC, check if all member companies have a PO for the
 * pool RFQ. If so, transition pool_state to 'cerrado'. Shared by Mode A and B.
 */
async function checkAndClosePools(poolId: string, rfqId: string) {
  const { data: memberRows, error: memberErr } = await supabase
    .from("pool_companies")
    .select("company_id")
    .eq("pool_id", poolId);
  if (memberErr) throw memberErr;

  const memberIds = (memberRows ?? []).map(
    (r: { company_id: string }) => r.company_id
  );

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
        .select("winning_quote_id, award_mode")
        .eq("id", poolId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PoolWinnerRow | null;
    },
  });

  const winningQuoteId = poolWinnerData?.winning_quote_id ?? null;
  const awardMode: "leader" | "per_company" =
    (poolWinnerData?.award_mode as "leader" | "per_company") ?? "leader";

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

  // ---- confirmMyAward mutation (Mode B only) --------------------------------
  // UPSERTs this company's per-item award selections into pool_company_awards,
  // then calls pool_finalize_award_mode_b to check/transition pool_state.
  // Never writes winning_quote_id.

  const confirmAwardMutation = useMutation({
    mutationFn: async ({
      poolId,
      awards,
    }: {
      poolId: string;
      awards: { rfqItemId: string; quoteItemId: string }[];
    }) => {
      if (!companyId) throw new Error("No company_id");

      // Only valid in Mode B — guard silently (DB RLS is the real enforcement).
      const rows = awards.map((a) => ({
        pool_id: poolId,
        company_id: companyId,
        rfq_item_id: a.rfqItemId,
        winning_quote_item_id: a.quoteItemId,
      }));

      const { error: upsertErr } = await supabase
        .from("pool_company_awards")
        .upsert(rows, { onConflict: "pool_id,company_id,rfq_item_id" });
      if (upsertErr) throw upsertErr;

      const { error: rpcErr } = await supabase.rpc(
        "pool_finalize_award_mode_b",
        { p_pool_id: poolId }
      );
      if (rpcErr) throw rpcErr;
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: ["pool-winner", poolId] });
      qc.invalidateQueries({ queryKey: poolComparativaKey(poolId) });
    },
    onError: (e: Error) => {
      console.error("[usePoolAward] confirmMyAward failed:", e.message);
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

      // Step 2: Read pool award_mode to bifurcate the path.
      const { data: poolModeRow, error: poolModeErr } = await supabase
        .from("purchase_pools")
        .select("award_mode, winning_quote_id")
        .eq("id", poolId)
        .limit(1)
        .maybeSingle();
      if (poolModeErr) throw poolModeErr;
      const resolvedAwardMode =
        (poolModeRow?.award_mode as "leader" | "per_company") ?? "leader";

      // ---------------------------------------------------------------------------
      // Mode B path — per-company, per-item, potentially multiple OCs
      // ---------------------------------------------------------------------------
      if (resolvedAwardMode === "per_company") {
        // Read MY company's pool_company_awards.
        const { data: awardsRaw, error: awardsErr } = await supabase
          .from("pool_company_awards")
          .select("rfq_item_id, winning_quote_item_id")
          .eq("pool_id", poolId)
          .eq("company_id", companyId);
        if (awardsErr) throw awardsErr;
        if (!awardsRaw || awardsRaw.length === 0) {
          throw new Error(
            "No awards found for this company. Confirm your per-item adjudication first."
          );
        }
        const myAwards: PoolCompanyAward[] = (awardsRaw as any[]).map((r) => ({
          rfq_item_id: r.rfq_item_id as string,
          winning_quote_item_id: r.winning_quote_item_id as string,
        }));

        // Fetch all quote_items for those quote_item_ids (to resolve provider_id).
        const quoteItemIds = myAwards.map((a) => a.winning_quote_item_id);
        const { data: qiRaw, error: qiErr } = await supabase
          .from("quote_items")
          .select(
            `id, rfq_item_id, unit_price,
             quotes!inner(provider_id),
             rfq_items!inner(material_id, description, unit)`
          )
          .in("id", quoteItemIds);
        if (qiErr) throw qiErr;

        const quoteItemsWithProvider: QuoteItemWithProvider[] = (
          qiRaw ?? []
        ).map((qi: any) => ({
          id: qi.id,
          rfq_item_id: qi.rfq_item_id,
          provider_id: qi.quotes?.provider_id as string,
          unit_price: Number(qi.unit_price),
          description: qi.rfq_items?.description ?? "",
          unit: qi.rfq_items?.unit ?? "",
        }));

        // Group awards by provider to determine OC count.
        const ocDescriptors = groupAwardsByProvider(
          myAwards,
          quoteItemsWithProvider
        );

        if (ocDescriptors.length === 0) {
          throw new Error(
            "No OC descriptors could be built from the per-item awards."
          );
        }

        // Fetch MY company's contributions for quantity resolution.
        const { data: contribRows, error: contribErr } = await supabase
          .from("pool_item_contributions")
          .select(`quantity, pool_items!inner(material_id, pool_id)`)
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

        // INSERT one OC per provider descriptor (double-generation guard per rfq+provider).
        for (const desc of ocDescriptors) {
          // Guard: skip if PO for (rfq_id, provider_id) already exists.
          const { data: existingPo, error: guardErr } = await supabase
            .from("purchase_orders")
            .select("id")
            .eq("rfq_id", rfqId)
            .eq("company_id", companyId)
            .eq("provider_id", desc.provider_id)
            .limit(1)
            .maybeSingle();
          if (guardErr) throw guardErr;
          if (existingPo) continue; // already generated for this provider

          const winningLines: WinningLine[] = desc.items.map((item) => ({
            material_id: item.rfq_item_id, // use rfq_item_id as proxy; contributions keyed by material
            description: item.description,
            unit: item.unit,
            unit_price: item.unit_price,
          }));

          // Build OC lines using contribution quantities (companyOcLines by material_id
          // needs material_id; for Mode B we need to match by rfq_item_id via quoteItems).
          // Simplified: use each award's quote_item unit_price and match contribution by
          // rfq_item → pool_item → material_id chain.
          const rfqItemToMaterial = new Map<string, string>();
          for (const qi of quoteItemsWithProvider) {
            // rfq_item material_id is carried in qiRaw — rebuild from quoteItemsWithProvider
            // which only has rfq_item_id. We need materialId per rfq_item_id.
          }

          // For Mode B, we build OC lines directly from the awards (no material_id indirection):
          // quantity comes from pool_item_contributions matched to rfq_item via pool_items.
          // We need the rfq_item → pool_item → contribution quantity mapping.
          const { data: rfqItemsRaw, error: rfqItemsErr } = await supabase
            .from("rfq_items")
            .select("id, material_id")
            .in("id", desc.items.map((i) => i.rfq_item_id));
          if (rfqItemsErr) throw rfqItemsErr;

          const rfqItemMaterialMap = new Map<string, string>(
            (rfqItemsRaw ?? []).map((r: any) => [r.id, r.material_id])
          );

          const ocLines = desc.items.map((item) => {
            const materialId = rfqItemMaterialMap.get(item.rfq_item_id) ?? item.rfq_item_id;
            const contrib = myContribs.find((c) => c.material_id === materialId);
            return {
              material_id: materialId,
              description: item.description,
              unit: item.unit,
              quantity: contrib?.quantity ?? 0,
              unit_price: item.unit_price,
            };
          }).filter((l) => l.quantity > 0);

          if (ocLines.length === 0) continue;

          const totalAmount = ocLines.reduce(
            (sum, line) => sum + line.quantity * line.unit_price,
            0
          );

          const { data: poRow, error: poErr } = await supabase
            .from("purchase_orders")
            .insert({
              company_id: companyId,
              provider_id: desc.provider_id,
              rfq_id: rfqId,
              total_amount: totalAmount,
              created_by: user.id,
            })
            .select("id")
            .single();
          if (poErr) throw poErr;

          const poId = (poRow as { id: string }).id;

          const { error: poItemsErr } = await supabase
            .from("purchase_order_items")
            .insert(
              ocLines.map((line) => ({
                purchase_order_id: poId,
                description: line.description,
                quantity: line.quantity,
                unit: line.unit,
                unit_price: line.unit_price,
                material_id: line.material_id,
              }))
            );
          if (poItemsErr) throw poItemsErr;
        }

        // Check if ALL member companies now have POs for the pool RFQ → cerrado.
        await checkAndClosePools(poolId, rfqId);
        return;
      }

      // ---------------------------------------------------------------------------
      // Mode A path (leader) — unchanged from original implementation
      // ---------------------------------------------------------------------------

      // Guard — check if this company already has a PO for the pool RFQ.
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
      // We deliberately avoid querying quotes.status='awarded' — that column can
      // only be written by the provider that owns the quote.
      const resolvedWinningQuoteId = poolModeRow?.winning_quote_id as string | null;
      if (!resolvedWinningQuoteId) {
        throw new Error(
          "No winning quote found. Adjudicate the pool before generating an OC."
        );
      }

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
      await checkAndClosePools(poolId, rfqId);
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
    awardMode,
    isLoading,
    error,

    adjudicate: async (poolId, winningQuoteId) => {
      await adjudicateMutation.mutateAsync({ poolId, winningQuoteId });
    },
    isAdjudicating: adjudicateMutation.isPending,

    confirmMyAward: async (poolId, awards) => {
      await confirmAwardMutation.mutateAsync({ poolId, awards });
    },
    isConfirmingAward: confirmAwardMutation.isPending,

    generateMyOc: async (poolId) => {
      await generateOcMutation.mutateAsync({ poolId });
    },
    isGeneratingOc: generateOcMutation.isPending,
  };
}
