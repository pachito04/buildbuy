import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { resolvePrecioVigente } from '@/lib/precio-vigencia';
import type { PrecioWithMaterial } from '@/hooks/usePreciosProveedor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderInfo {
  id: string;
  name: string;
}

interface ComparativaPreciosProps {
  /** All precio_proveedor rows across all providers (already fetched by parent). */
  allPrecios: PrecioWithMaterial[];
  /** Ordered list of providers to display as columns. */
  providers: ProviderInfo[];
  /** Reference date for vigencia resolution — defaults to today. */
  fecha?: string;
}

interface MaterialRow {
  materialId: string;
  materialName: string;
  unit: string;
  /** keyed by provider_id → vigente price or null */
  prices: Record<string, number | null>;
  /** provider_id with the lowest price today */
  cheapestProviderId: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComparativaPrecios({
  allPrecios,
  providers,
  fecha,
}: ComparativaPreciosProps) {
  const today = fecha ?? new Date().toISOString().split('T')[0];

  const rows: MaterialRow[] = useMemo(() => {
    // Group by material_id
    const byMaterial = new Map<string, PrecioWithMaterial[]>();
    for (const p of allPrecios) {
      if (!byMaterial.has(p.material_id)) byMaterial.set(p.material_id, []);
      byMaterial.get(p.material_id)!.push(p);
    }

    const result: MaterialRow[] = [];
    for (const [materialId, rows] of byMaterial) {
      const sample = rows.find((r) => r.material !== null);
      const materialName = sample?.material?.name ?? materialId;
      const unit = sample?.material?.unit ?? '';

      const prices: Record<string, number | null> = {};
      for (const prov of providers) {
        const provRows = rows.filter((r) => r.provider_id === prov.id);
        const resolved = resolvePrecioVigente(provRows, today);
        prices[prov.id] = resolved?.precio_unitario ?? null;
      }

      // Find cheapest (non-null)
      let cheapestProviderId: string | null = null;
      let minPrice = Infinity;
      for (const [provId, price] of Object.entries(prices)) {
        if (price !== null && price < minPrice) {
          minPrice = price;
          cheapestProviderId = provId;
        }
      }

      result.push({ materialId, materialName, unit, prices, cheapestProviderId });
    }

    return result.sort((a, b) => a.materialName.localeCompare(b.materialName));
  }, [allPrecios, providers, today]);

  if (providers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No hay proveedores seleccionados para comparar.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No hay precios vigentes para mostrar.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Material</TableHead>
            <TableHead className="w-16">Unit.</TableHead>
            {providers.map((prov) => (
              <TableHead key={prov.id} className="text-right min-w-[120px]">
                {prov.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.materialId}>
              <TableCell className="font-medium">{row.materialName}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{row.unit}</TableCell>
              {providers.map((prov) => {
                const price = row.prices[prov.id];
                const isCheapest = row.cheapestProviderId === prov.id;
                return (
                  <TableCell key={prov.id} className="text-right">
                    {price === null ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <span
                        className={
                          isCheapest
                            ? 'font-semibold text-green-700'
                            : 'text-foreground'
                        }
                      >
                        {price.toLocaleString('es-AR', {
                          style: 'currency',
                          currency: 'ARS',
                          minimumFractionDigits: 2,
                        })}
                        {isCheapest && (
                          <Badge
                            variant="secondary"
                            className="ml-1 text-[10px] px-1 py-0 bg-green-100 text-green-800"
                          >
                            mejor
                          </Badge>
                        )}
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
