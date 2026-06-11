/**
 * PoolProvidersPanel
 *
 * GAP3 — Manual provider selection for a pool.
 *
 * Each participating company independently selects which of its eligible providers
 * (own + global) to bring into this specific pool. The selections are persisted in
 * pool_providers and later dispatched to rfq_providers when generateSharedRfq runs.
 *
 * Shows:
 *  - Candidate provider checklist (own + global) with selection toggle.
 *  - Consolidated member-wide view of providers already in this pool.
 *
 * Props:
 *  - poolId    — the pool to manage providers for.
 *  - companyId — the viewer's company (used to determine own vs global in the label).
 */

import { usePoolProviders } from "@/hooks/usePoolProviders";
import { useToast } from "@/hooks/use-toast";

interface Props {
  poolId: string;
  companyId: string;
}

export function PoolProvidersPanel({ poolId, companyId }: Props) {
  const { toast } = useToast();
  const {
    candidateProviders,
    poolProviders,
    isLoadingCandidates,
    isLoadingPoolProviders,
    selectProvider,
    deselectProvider,
  } = usePoolProviders(poolId);

  // Derive the set of provider_ids already selected by this company for this pool.
  const mySelectedProviderIds = new Set(
    poolProviders
      .filter((pp) => pp.selected_by_company_id === companyId)
      .map((pp) => pp.provider_id)
  );

  // Derive the full consolidated set across all members (for the member-wide list).
  const allSelectedProviderIds = new Set(poolProviders.map((pp) => pp.provider_id));

  const handleToggle = async (providerId: string) => {
    const isCurrentlySelected = mySelectedProviderIds.has(providerId);
    try {
      if (isCurrentlySelected) {
        await deselectProvider(providerId);
      } else {
        await selectProvider(providerId);
      }
    } catch (e: any) {
      toast({
        title: isCurrentlySelected
          ? "Error al quitar proveedor"
          : "Error al agregar proveedor",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  if (isLoadingCandidates || isLoadingPoolProviders) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        Cargando proveedores...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* My candidate set — own + global providers */}
      <div>
        <h4 className="text-sm font-medium mb-2">
          Mis proveedores para este pool
        </h4>
        {candidateProviders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tenés proveedores habilitados.
          </p>
        ) : (
          <ul className="space-y-1">
            {candidateProviders.map((provider) => {
              const isSelected = mySelectedProviderIds.has(provider.id);
              const isGlobal = provider.company_id === null;
              return (
                <li key={provider.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`provider-${provider.id}`}
                    checked={isSelected}
                    onChange={() => handleToggle(provider.id)}
                    className="h-4 w-4"
                  />
                  <label
                    htmlFor={`provider-${provider.id}`}
                    className="text-sm cursor-pointer"
                  >
                    {provider.name}
                    {isGlobal && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (global)
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Consolidated member-wide pool providers list */}
      {allSelectedProviderIds.size > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            Proveedores en este pool ({allSelectedProviderIds.size})
          </h4>
          <ul className="space-y-1">
            {candidateProviders
              .filter((p) => allSelectedProviderIds.has(p.id))
              .map((provider) => (
                <li key={provider.id} className="text-sm text-muted-foreground">
                  {provider.name}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
