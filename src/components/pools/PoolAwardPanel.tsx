/**
 * PoolAwardPanel
 *
 * Renders the shared comparativa + adjudication + OC-generation flow for a
 * pool in states 'en_comparativa', 'adjudicado', or 'cerrado'.
 *
 * Mounted from PoolFlowPanel; receives pool_state as a gate.
 *
 * Layout:
 *  1. Pool-state header strip (state badge + winner info if adjudicado).
 *  2. Shared comparativa table — quotes vs rfq_items with per-line unit prices,
 *     provider total, delivery. "Adjudicar" radio selector visible when
 *     pool_state = 'en_comparativa'.
 *  3. Per-company contribution breakdown (reuses PoolConsolidatedView style).
 *  4. Action bar:
 *     - en_comparativa: "Adjudicar cotización seleccionada" button.
 *     - adjudicado: "Generar mi orden de compra" button (disabled if already generated).
 *     - cerrado: read-only summary.
 *
 * Confidentiality: Only shows consolidated RFQ/quote data + per-company
 * contribution quantities. pool_requests detail is never queried here.
 */

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePoolAward } from "@/hooks/usePoolAward";
import { PoolConsolidatedView } from "./PoolConsolidatedView";
import {
  ChevronDown,
  ChevronRight,
  Trophy,
  ShoppingCart,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Sub-types (local, not re-exported from hook)
// ---------------------------------------------------------------------------

interface QuoteRow {
  id: string;
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  poolId: string;
  poolState: "en_comparativa" | "adjudicado" | "cerrado";
  /** Map of company_id → company name (built by PoolCard from companies list). */
  companyNames: Map<string, string>;
  /** The viewer's own company_id. */
  companyId: string;
  /**
   * All pool_companies rows for this pool, so we can show which companies
   * have already generated their OC.
   */
  memberCompanyIds: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a number as Argentine peso. */
function formatARS(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

function formatQty(n: number) {
  return n % 1 === 0
    ? n.toFixed(0)
    : n.toFixed(3).replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Comparativa table component (pool-specific, read-only adjudication by quote)
// ---------------------------------------------------------------------------

interface ComparativaTableProps {
  quotes: QuoteRow[];
  /** rfq_items keyed by id. */
  rfqItemsById: Map<string, RfqItemRow>;
  /** Ordered list of unique rfq_item ids (defines row order). */
  rfqItemIds: string[];
  /** Provider names keyed by provider_id. */
  providerNames: Map<string, string>;
  /** Currently selected quote id (for adjudication). */
  selectedQuoteId: string | null;
  onSelectQuote: (quoteId: string) => void;
  /** Which quote is the winner (status = 'awarded'). */
  winningQuoteId: string | null;
  /** If true, quote selection radio is shown. */
  canSelect: boolean;
}

function ComparativaTable({
  quotes,
  rfqItemsById,
  rfqItemIds,
  providerNames,
  selectedQuoteId,
  onSelectQuote,
  winningQuoteId,
  canSelect,
}: ComparativaTableProps) {
  if (!quotes.length) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Sin cotizaciones recibidas para esta RFQ compartida.
      </div>
    );
  }

  // Compute best unit price per rfq_item (for "vs Mejor" column).
  const bestPriceByItem = new Map<string, number>();
  for (const rfqItemId of rfqItemIds) {
    let best = Infinity;
    for (const q of quotes) {
      const qi = q.quote_items.find((qi) => qi.rfq_item_id === rfqItemId);
      if (qi && qi.unit_price < best) best = qi.unit_price;
    }
    if (best < Infinity) bestPriceByItem.set(rfqItemId, best);
  }

  // Compute total for each quote = sum(qty * unit_price) for all lines.
  const totalByQuote = new Map<string, number>();
  for (const q of quotes) {
    let total = 0;
    for (const qi of q.quote_items) {
      const rfqItem = qi.rfq_items ?? rfqItemsById.get(qi.rfq_item_id);
      if (rfqItem) {
        total += rfqItem.quantity * qi.unit_price;
      }
    }
    totalByQuote.set(q.id, q.total_price ?? total);
  }

  // Identify cheapest quote by total.
  let cheapestQuoteId: string | null = null;
  let cheapestTotal = Infinity;
  for (const [qId, total] of totalByQuote) {
    if (total < cheapestTotal) {
      cheapestTotal = total;
      cheapestQuoteId = qId;
    }
  }

  return (
    <div className="border rounded-lg overflow-x-auto">
      <div className="bg-muted px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        Comparativa de Cotizaciones
        <Badge variant="outline" className="text-[10px]">
          {quotes.length} cotización{quotes.length !== 1 ? "es" : ""}
        </Badge>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {canSelect && (
              <th className="text-center px-3 py-2 font-medium w-12">
                Ganar.
              </th>
            )}
            <th className="text-left px-3 py-2 font-medium">Proveedor</th>
            <th className="text-right px-3 py-2 font-medium">Total</th>
            <th className="text-center px-3 py-2 font-medium">Entrega</th>
            {rfqItemIds.map((id) => {
              const item = rfqItemsById.get(id);
              return (
                <th
                  key={id}
                  className="text-right px-3 py-2 font-medium whitespace-nowrap"
                >
                  <span className="truncate max-w-[120px] block" title={item?.description}>
                    {item?.description ?? id.slice(0, 6)}
                  </span>
                  <span className="font-normal text-muted-foreground text-[10px]">
                    /{item?.unit ?? ""}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => {
            const providerName =
              providerNames.get(q.provider_id) ??
              q.provider_id.slice(0, 8);
            const total = totalByQuote.get(q.id) ?? 0;
            const isCheapest = q.id === cheapestQuoteId && quotes.length > 1;
            const isWinner = q.id === winningQuoteId;
            const isSelected = q.id === selectedQuoteId;

            return (
              <tr
                key={q.id}
                className={`border-t transition-colors ${
                  isWinner
                    ? "bg-amber-50 dark:bg-amber-950/20"
                    : isCheapest
                    ? "bg-green-50 dark:bg-green-950/20"
                    : ""
                } ${
                  isSelected && canSelect
                    ? "ring-2 ring-inset ring-primary/40"
                    : ""
                }`}
              >
                {canSelect && (
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name="winning-quote"
                      value={q.id}
                      checked={isSelected}
                      onChange={() => onSelectQuote(q.id)}
                      className="accent-primary"
                      aria-label={`Seleccionar cotización de ${providerName}`}
                    />
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">{providerName}</span>
                    {isWinner && (
                      <Badge className="bg-amber-600 text-white text-[10px] py-0 gap-0.5">
                        <Trophy className="h-2.5 w-2.5" />
                        Ganadora
                      </Badge>
                    )}
                    {isCheapest && !isWinner && (
                      <Badge className="bg-green-600 text-white text-[10px] py-0">
                        Mejor precio
                      </Badge>
                    )}
                    {q.conditions && (
                      <span
                        className="text-xs text-muted-foreground truncate max-w-[140px]"
                        title={q.conditions}
                      >
                        {q.conditions}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  ${formatARS(total)}
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">
                  {q.delivery_days != null ? `${q.delivery_days}d` : "—"}
                </td>
                {rfqItemIds.map((itemId) => {
                  const qi = q.quote_items.find(
                    (qi) => qi.rfq_item_id === itemId
                  );
                  if (!qi) {
                    return (
                      <td
                        key={itemId}
                        className="px-3 py-2 text-center text-muted-foreground"
                      >
                        —
                      </td>
                    );
                  }
                  const bestPrice = bestPriceByItem.get(itemId) ?? 0;
                  const isBestForItem =
                    qi.unit_price === bestPrice && quotes.length > 1;
                  const diff =
                    bestPrice > 0
                      ? ((qi.unit_price - bestPrice) / bestPrice) * 100
                      : 0;
                  return (
                    <td key={itemId} className="px-3 py-2 text-right">
                      <span
                        className={`font-mono font-semibold ${
                          isBestForItem
                            ? "text-green-700 dark:text-green-400"
                            : ""
                        }`}
                      >
                        ${formatARS(qi.unit_price)}
                      </span>
                      {!isBestForItem && diff > 0 && (
                        <span className="block text-[10px] text-red-500">
                          +{diff.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OC Status strip (adjudicado state: shows which members have generated OC)
// ---------------------------------------------------------------------------

interface OcStatusStripProps {
  memberCompanyIds: string[];
  companyNames: Map<string, string>;
  /** Set of company_ids that have already generated a PO for the pool RFQ. */
  companiesWithOc: Set<string>;
  myCompanyId: string;
}

function OcStatusStrip({
  memberCompanyIds,
  companyNames,
  companiesWithOc,
  myCompanyId,
}: OcStatusStripProps) {
  const [expanded, setExpanded] = useState(false);

  if (!memberCompanyIds.length) return null;

  const allDone = memberCompanyIds.every((id) => companiesWithOc.has(id));

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-muted text-xs font-medium text-muted-foreground uppercase tracking-wide hover:bg-muted/80 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          Estado de OCs por empresa
          {allDone ? (
            <Badge className="bg-emerald-600 text-white text-[10px] py-0">
              Todas generadas
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] py-0">
              {companiesWithOc.size}/{memberCompanyIds.length}
            </Badge>
          )}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      {expanded && (
        <div className="divide-y">
          {memberCompanyIds.map((compId) => {
            const name =
              companyNames.get(compId) ?? compId.slice(0, 8);
            const hasOc = companiesWithOc.has(compId);
            const isMe = compId === myCompanyId;
            return (
              <div
                key={compId}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className={isMe ? "font-semibold" : ""}>
                  {name}
                  {isMe && (
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      (mi empresa)
                    </span>
                  )}
                </span>
                {hasOc ? (
                  <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    OC generada
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Pendiente
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PoolAwardPanel({
  poolId,
  poolState,
  companyNames,
  companyId,
  memberCompanyIds,
}: Props) {
  const { toast } = useToast();
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  const {
    poolRfq,
    quotes,
    poolItems,
    contributions,
    winningQuoteId,
    isLoading,
    error,
    adjudicate,
    isAdjudicating,
    generateMyOc,
    isGeneratingOc,
  } = usePoolAward(poolId);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  // Provider names — extracted from the quote objects (provider_id is the only
  // handle we have here; the comparativa queries in Comparativa.tsx join to
  // providers table but usePoolAward does not). We fall back to short UUID.
  // To keep this slice self-contained we fetch provider names via a simple
  // supabase query keyed on the unique provider_ids in quotes.
  // NOTE: provider lookup below (useProviderNames) is done inside the hook
  // substitute pattern — we compute a stable set of ids and pass to the small
  // inline fetcher below.
  const providerIds = useMemo(() => {
    return Array.from(new Set(quotes.map((q) => q.provider_id)));
  }, [quotes]);

  const [providerNames, setProviderNames] = useState<Map<string, string>>(
    new Map()
  );

  // Fetch provider names whenever the set of provider_ids changes.
  // This is a fire-and-forget effect; if it fails we just show short IDs.
  const providerIdsKey = providerIds.join(",");
  useEffect(() => {
    if (!providerIds.length) return;
    let cancelled = false;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase
        .from("providers")
        .select("id, name")
        .in("id", providerIds)
        .then(({ data }) => {
          if (!cancelled && data) {
            setProviderNames(new Map(data.map((p: any) => [p.id, p.name])));
          }
        });
    });
    return () => { cancelled = true; };
  }, [providerIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a flat map of rfq_item_id → RfqItemRow from the quotes' nested data.
  const rfqItemsById = useMemo(() => {
    const map = new Map<string, RfqItemRow>();
    for (const q of quotes) {
      for (const qi of q.quote_items) {
        if (qi.rfq_items && !map.has(qi.rfq_item_id)) {
          map.set(qi.rfq_item_id, qi.rfq_items);
        }
      }
    }
    return map;
  }, [quotes]);

  // Stable ordered list of rfq_item ids (sort by description for consistency).
  const rfqItemIds = useMemo(() => {
    return Array.from(rfqItemsById.keys()).sort((a, b) => {
      const da = rfqItemsById.get(a)?.description ?? "";
      const db = rfqItemsById.get(b)?.description ?? "";
      return da.localeCompare(db, "es");
    });
  }, [rfqItemsById]);

  // Find the winning quote object via the hook-provided winningQuoteId.
  // winningQuoteId comes from purchase_pools.winning_quote_id — the authoritative
  // winner record, set by adjudicate() on the member-writable pool row.
  const winningQuote = useMemo(
    () => (winningQuoteId ? (quotes.find((q) => q.id === winningQuoteId) ?? null) : null),
    [quotes, winningQuoteId]
  );

  // Determine if this company already has a PO for the pool RFQ.
  // We infer this from the "all members" check done in generateMyOc — but since
  // we don't have that data directly, we use a simple local state flag that
  // gets set after a successful generateMyOc call. On mount we need a way to
  // know from data. The hook doesn't expose existing POs, so we track it with
  // a local query on the rfqId.
  const rfqId = poolRfq?.id ?? null;

  // companiesWithOc — track which members have a PO for this pool RFQ.
  // We query purchase_orders filtered by rfq_id (pool RFQ) and build a Set.
  const [companiesWithOc, setCompaniesWithOc] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    if (!rfqId) return;
    let cancelled = false;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase
        .from("purchase_orders")
        .select("company_id")
        .eq("rfq_id", rfqId)
        .then(({ data }) => {
          if (!cancelled && data) {
            setCompaniesWithOc(new Set(data.map((r: any) => r.company_id)));
          }
        });
    });
    return () => { cancelled = true; };
  }, [rfqId]); // eslint-disable-line react-hooks/exhaustive-deps

  const myOcAlreadyGenerated = companiesWithOc.has(companyId);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAdjudicate = async () => {
    if (!selectedQuoteId) return;
    try {
      await adjudicate(poolId, selectedQuoteId);
      toast({ title: "Cotizacion adjudicada", description: "El pool pasó a estado Adjudicado." });
    } catch (e: any) {
      toast({
        title: "Error al adjudicar",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleGenerateMyOc = async () => {
    try {
      await generateMyOc(poolId);
      // Refresh companiesWithOc after generation.
      if (rfqId) {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("purchase_orders")
          .select("company_id")
          .eq("rfq_id", rfqId);
        if (data) {
          setCompaniesWithOc(new Set(data.map((r: any) => r.company_id)));
        }
      }
      toast({
        title: "Orden de compra generada",
        description: "Tu OC fue creada con tus cantidades aportadas al pool.",
      });
    } catch (e: any) {
      toast({
        title: "Error al generar OC",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2 border-t">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-destructive border-t pt-3">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Error al cargar comparativa del pool: {error.message}
      </div>
    );
  }

  const isEnComparativa = poolState === "en_comparativa";
  const isAdjudicado = poolState === "adjudicado";
  const isCerrado = poolState === "cerrado";

  return (
    <div className="space-y-4 pt-2 border-t">
      {/* ------------------------------------------------------------------ */}
      {/* State header */}
      {/* ------------------------------------------------------------------ */}
      {isEnComparativa && (
        <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Comparativa compartida disponible. Seleccioná la cotización ganadora y
          adjudicá el pool.
        </div>
      )}

      {isAdjudicado && winningQuote && (
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <Trophy className="h-4 w-4 shrink-0" />
          <span>
            Pool adjudicado.{" "}
            <span className="font-semibold">
              {providerNames.get(winningQuote.provider_id) ??
                winningQuote.provider_id.slice(0, 8)}
            </span>{" "}
            — Total:{" "}
            <span className="font-mono font-semibold">
              $
              {formatARS(
                winningQuote.total_price ??
                  winningQuote.quote_items.reduce((s, qi) => {
                    const rfqItem =
                      qi.rfq_items ?? rfqItemsById.get(qi.rfq_item_id);
                    return s + (rfqItem?.quantity ?? 0) * qi.unit_price;
                  }, 0)
              )}
            </span>
          </span>
        </div>
      )}

      {isCerrado && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted border rounded-lg px-3 py-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          Pool cerrado. Todas las órdenes de compra fueron generadas.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Shared comparativa table */}
      {/* ------------------------------------------------------------------ */}
      <ComparativaTable
        quotes={quotes}
        rfqItemsById={rfqItemsById}
        rfqItemIds={rfqItemIds}
        providerNames={providerNames}
        selectedQuoteId={selectedQuoteId}
        onSelectQuote={setSelectedQuoteId}
        winningQuoteId={winningQuoteId}
        canSelect={isEnComparativa}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Per-company contribution breakdown (reuses PoolConsolidatedView) */}
      {/* ------------------------------------------------------------------ */}
      <PoolConsolidatedView
        poolItems={poolItems}
        contributions={contributions}
        companyNames={companyNames}
        isLoading={false}
      />

      {/* ------------------------------------------------------------------ */}
      {/* OC status per member (adjudicado + cerrado) */}
      {/* ------------------------------------------------------------------ */}
      {(isAdjudicado || isCerrado) && (
        <OcStatusStrip
          memberCompanyIds={memberCompanyIds}
          companyNames={companyNames}
          companiesWithOc={companiesWithOc}
          myCompanyId={companyId}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Action bar */}
      {/* ------------------------------------------------------------------ */}
      {isEnComparativa && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            size="sm"
            disabled={!selectedQuoteId || isAdjudicating}
            onClick={handleAdjudicate}
            title={
              !selectedQuoteId
                ? "Seleccioná una cotización ganadora primero"
                : undefined
            }
          >
            {isAdjudicating ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trophy className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isAdjudicating ? "Adjudicando..." : "Adjudicar cotización seleccionada"}
          </Button>
          {!selectedQuoteId && (
            <span className="text-xs text-muted-foreground">
              Seleccioná una cotización en la tabla para adjudicar.
            </span>
          )}
        </div>
      )}

      {isAdjudicado && (
        <div className="flex items-center gap-3 flex-wrap">
          {myOcAlreadyGenerated ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Tu orden de compra ya fue generada.
            </div>
          ) : (
            <Button
              size="sm"
              disabled={isGeneratingOc}
              onClick={handleGenerateMyOc}
            >
              {isGeneratingOc ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isGeneratingOc
                ? "Generando OC..."
                : "Generar mi orden de compra"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
