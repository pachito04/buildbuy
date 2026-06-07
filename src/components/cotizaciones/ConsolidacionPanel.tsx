import { useState, useEffect } from "react";
import { useConsolidacion } from "@/hooks/useConsolidacion";
import { ConsolidatedLine } from "@/lib/consolidacion-utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Layers, Send } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConsolidacionPanelProps {
  companyId: string | null;
}

// ---------------------------------------------------------------------------
// Skeleton loader — matches the grouped-line card shape
// ---------------------------------------------------------------------------

function ConsolidacionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-16 rounded-full ml-auto" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConsolidacionPanel({ companyId }: ConsolidacionPanelProps) {
  const { lines, urgencyByMaterialId, isLoading, error, createConsolidatedRfq, isCreating, createError } =
    useConsolidacion(companyId);

  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Show a toast whenever the mutation fails (e.g. race condition on items already taken).
  useEffect(() => {
    if (!createError) return;
    toast({
      title: "No se pudo generar la cotización",
      description: createError.message,
      variant: "destructive",
    });
  }, [createError, toast]);

  // ---- Selection helpers --------------------------------------------------

  const toggleLine = (materialId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) {
        next.delete(materialId);
      } else {
        next.add(materialId);
      }
      return next;
    });
  };

  const allSelected = lines.length > 0 && selectedIds.size === lines.length;
  const noneSelected = selectedIds.size === 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(lines.map((l) => l.material_id)));
    }
  };

  // ---- Submit -------------------------------------------------------------

  const handleGenerate = () => {
    const selected = lines.filter((l) => selectedIds.has(l.material_id));
    if (selected.length === 0) return;

    createConsolidatedRfq(selected);
    setSelectedIds(new Set());
    toast({
      title: "Cotización consolidada generada",
      description: `Se generó una SC consolidada con ${selected.length} línea(s) de material.`,
    });
  };

  // ---- Loading state ------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        <ConsolidacionSkeleton />
      </div>
    );
  }

  // ---- Error state --------------------------------------------------------

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 mx-auto text-destructive opacity-70" />
          <p className="text-sm font-medium text-destructive">Error al cargar ítems elegibles</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  // ---- Empty state --------------------------------------------------------

  if (lines.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center space-y-3">
          <Layers className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm font-medium">No hay ítems para consolidar</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Los materiales con entrega en depósito, estado{" "}
            <span className="font-mono">sin_pedir</span> y ruteo{" "}
            <span className="font-mono">pendiente</span> o{" "}
            <span className="font-mono">cotizacion</span> aparecerán acá agrupados por material.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ---- Main render --------------------------------------------------------

  const selectedLines = lines.filter((l) => selectedIds.has(l.material_id));
  const totalSelectedQty = selectedLines.reduce((acc, l) => acc + l.totalQuantity, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Checkbox
            id="select-all"
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="Seleccionar todas las líneas"
          />
          <label htmlFor="select-all" className="text-sm font-medium cursor-pointer select-none">
            {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
          </label>
          {!noneSelected && (
            <Badge variant="secondary" className="text-xs">
              {selectedIds.size} de {lines.length} seleccionadas
            </Badge>
          )}
        </div>

        <Button
          size="sm"
          disabled={noneSelected || isCreating}
          onClick={handleGenerate}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {isCreating
            ? "Generando..."
            : `Generar cotización consolidada${!noneSelected ? ` (${totalSelectedQty.toLocaleString("es-AR")} u.)` : ""}`}
        </Button>
      </div>

      {/* Grouped lines */}
      <Accordion type="multiple" className="w-full space-y-2">
        {lines.map((line) => {
          const isSelected = selectedIds.has(line.material_id);
          const isUrgent = urgencyByMaterialId[line.material_id] ?? false;

          return (
            <div
              key={line.material_id}
              className={`rounded-lg border transition-colors ${
                isSelected ? "border-primary/60 bg-primary/5" : "border-border"
              }`}
            >
              {/* Line header row */}
              <div className="flex items-start gap-3 px-4 pt-3 pb-2">
                <Checkbox
                  id={`line-${line.material_id}`}
                  checked={isSelected}
                  onCheckedChange={() => toggleLine(line.material_id)}
                  className="mt-0.5"
                  aria-label={`Seleccionar ${line.description}`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label
                      htmlFor={`line-${line.material_id}`}
                      className="text-sm font-semibold cursor-pointer"
                    >
                      {line.description}
                    </label>
                    {isUrgent && (
                      <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                        Urgente
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {line.sources.length} fuente{line.sources.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Total quantity */}
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold font-mono">
                    {line.totalQuantity.toLocaleString("es-AR")}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">{line.unit}</span>
                </div>
              </div>

              {/* Expandable per-source breakdown */}
              <AccordionItem value={line.material_id} className="border-0">
                <AccordionTrigger className="px-4 py-1.5 text-xs text-muted-foreground hover:no-underline hover:text-foreground [&>svg]:h-3 [&>svg]:w-3">
                  Ver desglose por requerimiento
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">Req. #</th>
                          <th className="text-left px-3 py-1.5 font-medium">Obra</th>
                          <th className="text-right px-3 py-1.5 font-medium">Cantidad</th>
                          <th className="text-left px-3 py-1.5 font-medium">Unidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {line.sources.map((src) => (
                          <tr key={src.request_item_id} className="border-t">
                            <td className="px-3 py-1.5 font-mono">#{src.request_number}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {src.obra ?? <span className="italic">Sin obra</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono font-medium">
                              {src.quantity.toLocaleString("es-AR")}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">{line.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 border-t">
                        <tr>
                          <td className="px-3 py-1.5 font-medium" colSpan={2}>
                            Total
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-bold">
                            {line.totalQuantity.toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{line.unit}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </div>
          );
        })}
      </Accordion>
    </div>
  );
}
