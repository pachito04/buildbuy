/**
 * PoolConsolidatedView
 *
 * Renders the pool's consolidated pool_items with per-company contribution
 * breakdown (company name + quantity per line).
 *
 * A participant sees totals + contributions (shared, non-confidential) but
 * NOT another company's pool_requests detail (enforced by RLS + we never
 * query pool_requests of others here).
 */

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface PoolItemRow {
  id: string;
  description: string;
  unit: string;
  total_quantity: number;
  material_id: string | null;
}

interface ContributionRow {
  id: string;
  pool_item_id: string;
  company_id: string;
  quantity: number;
}

interface Props {
  poolItems: PoolItemRow[];
  contributions: ContributionRow[];
  /** Map of company_id → company name for resolving contribution labels. */
  companyNames: Map<string, string>;
  isLoading: boolean;
}

export function PoolConsolidatedView({
  poolItems,
  contributions,
  companyNames,
  isLoading,
}: Props) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Group contributions by pool_item_id for fast lookup.
  const contributionsByItem = new Map<string, ContributionRow[]>();
  for (const c of contributions) {
    const list = contributionsByItem.get(c.pool_item_id) ?? [];
    list.push(c);
    contributionsByItem.set(c.pool_item_id, list);
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!poolItems.length) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Sin ítems consolidados. Agregá requerimientos y luego ejecutá
        &quot;Consolidar&quot;.
      </p>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Vista Consolidada
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-medium w-6" />
            <th className="text-left px-3 py-2 font-medium">Material / Descripción</th>
            <th className="text-right px-3 py-2 font-medium">Total</th>
            <th className="text-left px-3 py-2 font-medium">Unidad</th>
          </tr>
        </thead>
        <tbody>
          {poolItems.map((item) => {
            const itemContributions = contributionsByItem.get(item.id) ?? [];
            const hasContributions = itemContributions.length > 0;
            const isExpanded = expandedItems.has(item.id);

            return (
              <>
                <tr
                  key={item.id}
                  className="border-t hover:bg-muted/30 transition-colors"
                >
                  <td className="px-3 py-2">
                    {hasContributions && (
                      <button
                        type="button"
                        onClick={() => toggleItem(item.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={
                          isExpanded
                            ? "Ocultar aportes por empresa"
                            : "Ver aportes por empresa"
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{item.description}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {item.total_quantity % 1 === 0
                      ? item.total_quantity.toFixed(0)
                      : item.total_quantity.toFixed(3).replace(/\.?0+$/, "")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.unit}
                  </td>
                </tr>

                {/* Per-company contribution breakdown (expandable) */}
                {isExpanded &&
                  itemContributions.map((contrib) => {
                    const companyName =
                      companyNames.get(contrib.company_id) ??
                      contrib.company_id.slice(0, 8);
                    return (
                      <tr
                        key={contrib.id}
                        className="border-t border-dashed bg-muted/20 text-xs"
                      >
                        <td className="px-3 py-1.5" />
                        <td className="px-3 py-1.5 pl-6 text-muted-foreground">
                          {companyName}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                          {contrib.quantity % 1 === 0
                            ? contrib.quantity.toFixed(0)
                            : contrib.quantity
                                .toFixed(3)
                                .replace(/\.?0+$/, "")}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {item.unit}
                        </td>
                      </tr>
                    );
                  })}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
