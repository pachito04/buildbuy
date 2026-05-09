import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowLeft, ArrowRight, SkipForward, FileSpreadsheet, MapPin } from "lucide-react";
import { PROVINCIAS, PROVINCIA_NAMES } from "@/data/argentina-geo";
import { ComputoUploader, type ParsedRow } from "./ComputoUploader";
import { getMatchConfidence, MATCH_COLORS, formatCurrency } from "@/lib/computo-utils";

interface WizardNuevaObraProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ObraData {
  name: string;
  description: string;
  code: string;
  address: string;
  city: string;
  province: string;
  contactName: string;
}

interface MatchResult {
  descripcion: string;
  material_id: string | null;
  material_name: string | null;
  material_unit: string | null;
  similarity_score: number;
}

type WizardStep = 1 | 2 | 3;

const INITIAL_OBRA: ObraData = {
  name: "",
  description: "",
  code: "",
  address: "",
  city: "",
  province: "",
  contactName: "",
};

export function WizardNuevaObra({ open, onOpenChange }: WizardNuevaObraProps) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [step, setStep] = useState<WizardStep>(1);
  const [obra, setObra] = useState<ObraData>(INITIAL_OBRA);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parsedFile, setParsedFile] = useState<File | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);

  const { data: materials = [] } = useQuery({
    queryKey: ["materials-catalog", companyId],
    enabled: !!companyId && step === 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("id, name, unit")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setStep(1);
    setObra(INITIAL_OBRA);
    setParsedRows([]);
    setParsedFile(null);
    setMatches([]);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  const handleParsed = async (rows: ParsedRow[], file: File) => {
    setParsedRows(rows);
    setParsedFile(file);

    if (!companyId) return;

    const descriptions = rows.map((r) => r.descripcion);
    const { data, error } = await supabase.rpc("match_materials", {
      p_company_id: companyId,
      p_descriptions: descriptions,
    });

    setMatches(error ? [] : (data ?? []) as MatchResult[]);
  };

  const matchStats = (() => {
    let high = 0, medium = 0, low = 0;
    for (const m of matches) {
      const conf = getMatchConfidence(m.similarity_score);
      if (conf === "high") high++;
      else if (conf === "medium") medium++;
      else low++;
    }
    return { high, medium, low };
  })();

  const totalEstimado = parsedRows.reduce(
    (s, r) => s + (r.cantidad ?? 0) * (r.precio_unitario ?? 0),
    0
  );

  const rubros = [...new Set(parsedRows.map((r) => r.rubro).filter(Boolean))];

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user || !companyId) throw new Error("Sin sesión");

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          company_id: companyId,
          name: obra.name,
          description: obra.description || null,
          code: obra.code || null,
          address: obra.address || null,
          city: obra.city || null,
          province: obra.province || null,
          contact_name: obra.contactName || null,
        })
        .select()
        .single();
      if (projectError) throw projectError;

      if (parsedRows.length > 0 && parsedFile) {
        const filePath = `${companyId}/${project.id}/v1_${parsedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("computos")
          .upload(filePath, parsedFile);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("computos")
          .getPublicUrl(filePath);

        const { data: computo, error: computoError } = await supabase
          .from("computo")
          .insert({
            project_id: project.id,
            version: 1,
            archivo_origen: parsedFile.name,
            archivo_url: urlData.publicUrl,
            total_estimado: totalEstimado,
            activo: true,
            created_by: user.id,
          })
          .select()
          .single();
        if (computoError) throw computoError;

        const items = parsedRows.map((row, i) => ({
          computo_id: computo.id,
          rubro: row.rubro || "Sin rubro",
          descripcion_origen: row.descripcion,
          material_id: matches[i]?.material_id ?? null,
          unidad: row.unidad || "u",
          cantidad_estimada: row.cantidad ?? 0,
          precio_unit_estimado: row.precio_unitario ?? 0,
          orden_dentro_rubro: i,
        }));

        const { error: itemsError } = await supabase
          .from("computo_item")
          .insert(items);
        if (itemsError) throw itemsError;
      }

      return project.id;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["obras"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Obra creada exitosamente");
      handleClose(false);
      navigate(`/obras/${projectId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canAdvanceStep1 = obra.name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Obra</DialogTitle>
        </DialogHeader>

        <StepIndicator current={step} />

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre de la obra *</Label>
              <Input
                placeholder="Ej: Edificio Palermo III"
                value={obra.name}
                onChange={(e) => setObra({ ...obra, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                placeholder="Descripción del proyecto..."
                value={obra.description}
                onChange={(e) => setObra({ ...obra, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código de obra</Label>
                <Input
                  placeholder="Ej: OBR-2024-003"
                  value={obra.code}
                  onChange={(e) => setObra({ ...obra, code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Persona de contacto</Label>
                <Input
                  placeholder="Nombre y apellido"
                  value={obra.contactName}
                  onChange={(e) => setObra({ ...obra, contactName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Domicilio</Label>
              <Input
                placeholder="Calle y número"
                value={obra.address}
                onChange={(e) => setObra({ ...obra, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provincia</Label>
                <Select
                  value={obra.province}
                  onValueChange={(v) => setObra({ ...obra, province: v, city: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar provincia..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCIA_NAMES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ciudad</Label>
                <Select
                  value={obra.city}
                  onValueChange={(v) => setObra({ ...obra, city: v })}
                  disabled={!obra.province}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={obra.province ? "Seleccionar ciudad..." : "Elegí una provincia primero"} />
                  </SelectTrigger>
                  <SelectContent>
                    {obra.province && PROVINCIAS[obra.province]?.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">* Campo obligatorio</p>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)} disabled={!canAdvanceStep1}>
                Siguiente
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">Cargar cómputo de obra</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Subí el Excel del arquitecto para mapear materiales contra el catálogo. Este paso es opcional.
              </p>
            </div>

            {parsedRows.length === 0 ? (
              <ComputoUploader onParsed={handleParsed} />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="h-9 w-9 rounded-md bg-background flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{parsedFile?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedRows.length} ítems · {rubros.length} rubros · {formatCurrency(totalEstimado)} total
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setParsedRows([]); setParsedFile(null); setMatches([]); }}
                  >
                    Reemplazar
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-green-50 rounded-md p-2.5">
                    <p className="text-[11px] text-green-900">Mapeados automáticamente</p>
                    <p className="text-lg font-medium text-green-700">{matchStats.high}</p>
                  </div>
                  <div className="bg-amber-50 rounded-md p-2.5">
                    <p className="text-[11px] text-amber-900">Necesitan revisión</p>
                    <p className="text-lg font-medium text-amber-700">{matchStats.medium}</p>
                  </div>
                  <div className="bg-red-50 rounded-md p-2.5">
                    <p className="text-[11px] text-red-900">Sin match en catálogo</p>
                    <p className="text-lg font-medium text-red-700">{matchStats.low}</p>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-1.5">Ítem del cómputo</th>
                        <th className="text-right px-3 py-1.5">Cant.</th>
                        <th className="text-left px-3 py-1.5">Ud.</th>
                        <th className="text-left px-3 py-1.5">Material catálogo</th>
                        <th className="text-right px-3 py-1.5">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, i) => {
                        const match = matches[i];
                        const score = match?.similarity_score ?? 0;
                        const confidence = getMatchConfidence(score);
                        const colors = MATCH_COLORS[confidence];
                        return (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5">
                              <span className="font-medium">{row.descripcion}</span>
                              {row.rubro && (
                                <span className="block text-[10px] text-muted-foreground">{row.rubro}</span>
                              )}
                            </td>
                            <td className="text-right px-3 py-1.5 font-mono">{row.cantidad ?? "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{row.unidad || "—"}</td>
                            <td className="px-3 py-1.5">
                              {match?.material_name ? (
                                <Badge variant="outline" className={`text-[10px] ${colors.bg} ${colors.text} border-transparent`}>
                                  {match.material_name}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground italic">Sin match</span>
                              )}
                            </td>
                            <td className="text-right px-3 py-1.5 font-mono">
                              {row.subtotal != null ? formatCurrency(row.subtotal) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-[11px] text-muted-foreground text-center">
                  Podés ajustar los matches en detalle desde el Dashboard de la obra después de crearla.
                </p>
              </div>
            )}

            <div className="flex justify-between pt-2 border-t">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver
              </Button>
              <div className="flex gap-2">
                {parsedRows.length === 0 && (
                  <Button variant="outline" onClick={() => setStep(3)}>
                    <SkipForward className="h-4 w-4 mr-1" />
                    Saltar paso
                  </Button>
                )}
                {parsedRows.length > 0 && (
                  <Button onClick={() => setStep(3)}>
                    Confirmar y continuar
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Confirmar nueva obra</h3>

            <div className="border rounded-lg p-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Nombre</p>
                <p className="text-sm font-medium">{obra.name}</p>
              </div>
              {obra.code && (
                <div>
                  <p className="text-xs text-muted-foreground">Código</p>
                  <p className="text-sm font-mono">{obra.code}</p>
                </div>
              )}
              {(obra.address || obra.city || obra.province) && (
                <div className="flex items-center gap-1 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {[obra.address, obra.city, obra.province].filter(Boolean).join(", ")}
                </div>
              )}
              {obra.contactName && (
                <div>
                  <p className="text-xs text-muted-foreground">Contacto</p>
                  <p className="text-sm">{obra.contactName}</p>
                </div>
              )}
              {obra.description && (
                <div>
                  <p className="text-xs text-muted-foreground">Descripción</p>
                  <p className="text-sm">{obra.description}</p>
                </div>
              )}
            </div>

            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">Cómputo</p>
              {parsedRows.length > 0 ? (
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{parsedFile?.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {parsedRows.length} ítems
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(totalEstimado)}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Sin cómputo — se puede cargar después desde el dashboard
                </p>
              )}
            </div>

            <div className="flex justify-between pt-2 border-t">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Crear obra
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ current }: { current: WizardStep }) {
  const steps = [
    { n: 1, label: "Datos generales" },
    { n: 2, label: "Cómputo" },
    { n: 3, label: "Confirmar" },
  ] as const;

  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          {i > 0 && <span className="w-6 h-px bg-border" />}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-5 h-5 rounded-full text-[11px] font-medium inline-flex items-center justify-center ${
                s.n === current
                  ? "bg-primary text-primary-foreground"
                  : s.n < current
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {s.n < current ? "✓" : s.n}
            </span>
            <span
              className={`text-xs ${
                s.n === current ? "font-medium" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
