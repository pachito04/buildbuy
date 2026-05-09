import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Loader2 } from "lucide-react";
import { getMatchConfidence, MATCH_COLORS } from "@/lib/computo-utils";
import type { ParsedRow } from "./ComputoUploader";

interface MatchResult {
  descripcion: string;
  material_id: string | null;
  material_name: string | null;
  material_unit: string | null;
  similarity_score: number;
}

interface MatchedRow extends ParsedRow {
  match: MatchResult | null;
  selectedMaterialId: string | null;
  ignored: boolean;
}

interface MatchTableProps {
  parsedRows: ParsedRow[];
  file: File;
  projectId: string;
  materials: Array<{ id: string; name: string; unit: string }>;
  matches: MatchResult[];
  onDone: () => void;
  onBack: () => void;
}

export function MatchTable({
  parsedRows,
  file,
  projectId,
  materials,
  matches,
  onDone,
  onBack,
}: MatchTableProps) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  const [rows, setRows] = useState<MatchedRow[]>(() =>
    parsedRows.map((row, i) => {
      const match = matches[i] ?? null;
      return {
        ...row,
        match,
        selectedMaterialId: match?.material_id ?? null,
        ignored: false,
      };
    })
  );

  const rubros = useMemo(() => [...new Set(rows.map((r) => r.rubro))], [rows]);

  const updateRow = (index: number, updates: Partial<MatchedRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!user || !companyId) throw new Error("Sin sesión");

      const activeRows = rows.filter((r) => !r.ignored);
      const totalEstimado = activeRows.reduce(
        (s, r) => s + (r.cantidad ?? 0) * (r.precio_unitario ?? 0),
        0
      );

      const { data: existingComputo } = await supabase
        .from("computo")
        .select("version")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = existingComputo ? existingComputo.version + 1 : 1;

      if (existingComputo) {
        await supabase
          .from("computo")
          .update({ activo: false })
          .eq("project_id", projectId)
          .eq("activo", true);
      }

      const filePath = `${companyId}/${projectId}/v${nextVersion}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("computos")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("computos")
        .getPublicUrl(filePath);

      const { data: computo, error: computoError } = await supabase
        .from("computo")
        .insert({
          project_id: projectId,
          version: nextVersion,
          archivo_origen: file.name,
          archivo_url: urlData.publicUrl,
          total_estimado: totalEstimado,
          activo: true,
          created_by: user.id,
        })
        .select()
        .single();
      if (computoError) throw computoError;

      const items = activeRows.map((row, i) => ({
        computo_id: computo.id,
        rubro: row.rubro || "Sin rubro",
        descripcion_origen: row.descripcion,
        material_id: row.selectedMaterialId,
        unidad: row.unidad || "u",
        cantidad_estimada: row.cantidad ?? 0,
        precio_unit_estimado: row.precio_unitario ?? 0,
        orden_dentro_rubro: i,
      }));

      const { error: itemsError } = await supabase
        .from("computo_item")
        .insert(items);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["computo"] });
      qc.invalidateQueries({ queryKey: ["obra-dashboard"] });
      toast.success("Cómputo confirmado exitosamente");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const globalIndex = (rubroIdx: number, rowInRubro: number): number => {
    let count = 0;
    for (let r = 0; r < rubros.length; r++) {
      const rubroRows = rows.filter((row) => row.rubro === rubros[r]);
      if (r === rubroIdx) return count + rowInRubro;
      count += rubroRows.length;
    }
    return 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Revisión de materiales ({rows.filter((r) => !r.ignored).length} ítems)
        </h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Alta
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Revisar
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Sin match
          </span>
        </div>
      </div>

      {rubros.map((rubro, rubroIdx) => {
        const rubroRows = rows
          .map((r, i) => ({ ...r, originalIndex: i }))
          .filter((r) => r.rubro === rubro);

        return (
          <div key={rubro} className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-3 py-2 text-xs font-semibold">
              {rubro || "Sin rubro"}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-1.5 w-[30%]">Descripción</th>
                  <th className="text-left px-3 py-1.5 w-[30%]">Material</th>
                  <th className="text-right px-3 py-1.5">Cant.</th>
                  <th className="text-left px-3 py-1.5">Ud.</th>
                  <th className="text-right px-3 py-1.5">P. Unit.</th>
                  <th className="text-center px-3 py-1.5 w-16">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rubroRows.map((row) => {
                  const score = row.match?.similarity_score ?? 0;
                  const confidence = getMatchConfidence(score);
                  const colors = MATCH_COLORS[confidence];

                  return (
                    <tr
                      key={row.originalIndex}
                      className={`border-t ${row.ignored ? "opacity-40" : ""}`}
                    >
                      <td className="px-3 py-2 text-xs">{row.descripcion}</td>
                      <td className="px-3 py-2">
                        {row.ignored ? (
                          <span className="text-xs text-muted-foreground italic">Ignorado</span>
                        ) : (
                          <Select
                            value={row.selectedMaterialId ?? "__none__"}
                            onValueChange={(v) =>
                              updateRow(row.originalIndex, {
                                selectedMaterialId: v === "__none__" ? null : v,
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Sin material" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Sin material</SelectItem>
                              {materials.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name} ({m.unit})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="text-right px-3 py-2 font-mono text-xs">
                        {row.cantidad ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{row.unidad || "—"}</td>
                      <td className="text-right px-3 py-2 font-mono text-xs">
                        {row.precio_unitario != null ? `$${row.precio_unitario.toLocaleString("es-AR")}` : "—"}
                      </td>
                      <td className="text-center px-3 py-2">
                        {row.ignored ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => updateRow(row.originalIndex, { ignored: false })}
                          >
                            Restaurar
                          </Button>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${colors.bg} ${colors.text} border-transparent`}
                            >
                              {score > 0 ? `${Math.round(score * 100)}%` : "—"}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => updateRow(row.originalIndex, { ignored: true })}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} disabled={confirmMutation.isPending}>
          Volver
        </Button>
        <Button
          className="flex-1"
          onClick={() => confirmMutation.mutate()}
          disabled={confirmMutation.isPending}
        >
          {confirmMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Confirmar cómputo
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
