import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Send, Upload, X, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { usePersistedDraft } from "@/hooks/usePersistedDraft";
import {
  EMPTY_DRAFT,
  RfqDraft,
  serializeDraft,
  deserializeDraft,
  isDetalleComplete,
  hasValidItems,
} from "@/lib/rfq-form-utils";

// Files (File objects) are not JSON-serializable — kept in plain local state,
// intentionally excluded from the persisted draft.

interface RfqNuevoProps {
  companyId: string | null;
  providers: any[];
}

const PRICE_TERMS_OPTIONS = [
  { value: "Precios firmes", label: "Precios firmes" },
  { value: "Sujetos a variación", label: "Sujetos a variación" },
  { value: "A confirmar", label: "A confirmar" },
] as const;

const PAYMENT_TERMS_OPTIONS = [
  { value: "cheque_30", label: "Cheque a 30 días" },
  { value: "cheque_60", label: "Cheque a 60 días" },
  { value: "cheque_90", label: "Cheque a 90 días" },
  { value: "transferencia_inmediata", label: "Transferencia inmediata" },
  { value: "contrato_acopio", label: "Contrato por Acopio" },
] as const;

/** Derives a visual completion indicator (icon + label) from a boolean predicate. */
function SectionStatusIcon({ complete }: { complete: boolean }) {
  if (complete) {
    return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
  }
  return <Circle className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function RfqNuevo({ companyId, providers }: RfqNuevoProps) {
  // ---------------------------------------------------------------------------
  // Draft persistence — files are intentionally excluded (not serializable)
  // ---------------------------------------------------------------------------
  const { value: draft, setValue: setDraft, clear: clearDraft, hadSavedDraft } =
    usePersistedDraft<RfqDraft>(
      "buildbuy-rfq-draft",
      EMPTY_DRAFT,
      serializeDraft,
      (raw) => deserializeDraft(raw, EMPTY_DRAFT),
    );

  // Dismissible "draft recovered" notice
  const [draftNoticeVisible, setDraftNoticeVisible] = useState(hadSavedDraft);

  // Files are not persisted — plain local state
  const [files, setFiles] = useState<File[]>([]);

  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  // ---------------------------------------------------------------------------
  // Section completion — derived from pure predicates (no logic in JSX)
  // ---------------------------------------------------------------------------
  const detalleComplete = isDetalleComplete(draft);
  const itemsComplete = hasValidItems(draft);

  // ---------------------------------------------------------------------------
  // Materials query
  // ---------------------------------------------------------------------------
  const { data: allMaterials } = useQuery({
    queryKey: ["all-materials-rfq", companyId],
    enabled: !!companyId,
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

  // ---------------------------------------------------------------------------
  // Submit mutation — preserves original behavior + new fields
  // ---------------------------------------------------------------------------
  const createAndSend = useMutation({
    mutationFn: async () => {
      const validItems = draft.items.filter((i) => i.material_id.trim().length > 0);
      if (!validItems.length) throw new Error("Agregá al menos un material");
      if (!draft.rfqType) throw new Error("Seleccioná un tipo de solicitud");
      if (!draft.closingDatetime) throw new Error("La fecha de cierre de cotización es obligatoria");
      if (!draft.deadline) throw new Error("La fecha límite de entrega es obligatoria");
      if (!draft.deliveryLocation.trim()) throw new Error("El lugar de entrega es obligatorio");
      if (!companyId) throw new Error("Usuario sin empresa asignada");

      const { data: rfq, error } = await supabase
        .from("rfqs")
        .insert({
          company_id: companyId,
          rfq_type: draft.rfqType as "open" | "closed_bid",
          deadline: draft.deadline || null,
          closing_datetime: draft.closingDatetime || null,
          delivery_location: draft.deliveryLocation || null,
          observations: draft.notes || null,
          descripcion: draft.descripcion || null,
          categoria: draft.categoria || null,
          price_terms: draft.priceTerms || null,
          payment_terms: draft.paymentTerms || null,
          created_by: user?.id,
          status: "sent",
        } as any)
        .select()
        .single();
      if (error) throw error;

      const rfqId = (rfq as any).id;

      const rfqItems = validItems.map((it) => ({
        rfq_id: rfqId,
        description: it.description,
        quantity: parseFloat(it.quantity) || 1,
        unit: it.unit,
        material_id: it.material_id,
        observations: it.observations || null,
      }));
      const { error: itemsErr } = await supabase.from("rfq_items").insert(rfqItems);
      if (itemsErr) throw itemsErr;

      if (draft.selectedProviders.length > 0) {
        const rfqProviders = draft.selectedProviders.map((pid) => ({
          rfq_id: rfqId,
          provider_id: pid,
        }));
        const { error: provErr } = await supabase.from("rfq_providers").insert(rfqProviders);
        if (provErr) throw provErr;
      }

      if (files.length > 0) {
        for (const file of files) {
          const filePath = `${rfqId}/${Date.now()}_${file.name}`;
          const { error: uploadErr } = await supabase.storage
            .from("rfq-attachments")
            .upload(filePath, file);
          if (uploadErr) throw uploadErr;

          await supabase.from("rfq_attachments").insert({
            rfq_id: rfqId,
            file_name: file.name,
            file_path: filePath,
            uploaded_by: user?.id,
          } as any);
        }
      }

      try {
        await supabase.functions.invoke("notify-providers", {
          body: { type: "rfq_sent", rfq_id: rfqId },
        });
      } catch (e) {
        console.warn("Email notification failed:", e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      clearDraft();
      setFiles([]);
      setDraftNoticeVisible(false);
      toast({
        title: "Solicitud enviada",
        description: "La solicitud fue creada y enviada a proveedores automáticamente.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ---------------------------------------------------------------------------
  // Discard draft
  // ---------------------------------------------------------------------------
  const handleDiscard = () => {
    clearDraft();
    setFiles([]);
    setDraftNoticeVisible(false);
    toast({ title: "Borrador descartado", description: "El formulario fue reiniciado." });
  };

  // ---------------------------------------------------------------------------
  // Material helpers — same combine logic as original
  // ---------------------------------------------------------------------------
  const addItem = () =>
    setDraft((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { material_id: "", description: "", quantity: "1", unit: "", observations: "" },
      ],
    }));

  const removeItem = (i: number) =>
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== i),
    }));

  const selectMaterial = (i: number, materialId: string) => {
    const mat = allMaterials?.find((m) => m.id === materialId);
    setDraft((prev) => {
      const existingIdx = prev.items.findIndex(
        (it, idx) => idx !== i && it.material_id === materialId,
      );
      if (existingIdx !== -1) {
        const copy = [...prev.items];
        const currentQty = parseFloat(copy[existingIdx].quantity) || 1;
        const addedQty = parseFloat(copy[i].quantity) || 1;
        copy[existingIdx] = {
          ...copy[existingIdx],
          quantity: String(currentQty + addedQty),
        };
        copy.splice(i, 1);
        toast({
          title: "Material combinado",
          description: "Se sumaron las cantidades del material repetido.",
        });
        return { ...prev, items: copy.length ? copy : [{ material_id: "", description: "", quantity: "1", unit: "", observations: "" }] };
      }
      const copy = [...prev.items];
      copy[i] = {
        ...copy[i],
        material_id: materialId,
        description: mat?.name ?? "",
        unit: mat?.unit ?? "",
      };
      return { ...prev, items: copy };
    });
  };

  const updateItemField = (
    i: number,
    field: keyof RfqDraft["items"][number],
    value: string,
  ) =>
    setDraft((prev) => {
      const copy = [...prev.items];
      copy[i] = { ...copy[i], [field]: value };
      return { ...prev, items: copy };
    });

  const toggleProvider = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      selectedProviders: prev.selectedProviders.includes(id)
        ? prev.selectedProviders.filter((p) => p !== id)
        : [...prev.selectedProviders, id],
    }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-display">Nueva Solicitud de Cotización</CardTitle>
        <p className="text-xs text-muted-foreground">
          Seleccioná materiales del catálogo. Al emitir, se envía automáticamente a proveedores.
        </p>
      </CardHeader>
      <CardContent>
        {/* Draft recovered notice */}
        {draftNoticeVisible && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span className="flex-1">Borrador recuperado. Podés continuar donde lo dejaste.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-amber-700 hover:text-amber-900"
              onClick={() => setDraftNoticeVisible(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createAndSend.mutate();
          }}
          className="space-y-4"
        >
          <Accordion type="multiple" defaultValue={["detalle"]} className="w-full">
            {/* ----------------------------------------------------------------
                Section 1 — Detalle
            ---------------------------------------------------------------- */}
            <AccordionItem value="detalle">
              <AccordionTrigger className="hover:no-underline">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <SectionStatusIcon complete={detalleComplete} />
                  Detalle de la solicitud
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  {/* Tipo de solicitud */}
                  <div className="space-y-2">
                    <Label>Tipo de solicitud *</Label>
                    <Select
                      value={draft.rfqType}
                      onValueChange={(v) =>
                        setDraft((prev) => ({
                          ...prev,
                          rfqType: v as RfqDraft["rfqType"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccioná un tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Pedido Abierto</SelectItem>
                        <SelectItem value="closed_bid">Licitación Cerrada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Fechas: cierre + entrega límite */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Cierre de cotización *</Label>
                      <Input
                        type="datetime-local"
                        value={draft.closingDatetime}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, closingDatetime: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Entrega límite *</Label>
                      <Input
                        type="date"
                        value={draft.deadline}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, deadline: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  {/* Descripción */}
                  <div className="space-y-2">
                    <Label>Descripción *</Label>
                    <Textarea
                      placeholder="Describí brevemente el alcance de esta solicitud..."
                      value={draft.descripcion}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, descripcion: e.target.value }))
                      }
                      rows={2}
                    />
                  </div>

                  {/* Categoría */}
                  <div className="space-y-2">
                    <Label>Categoría *</Label>
                    <Input
                      placeholder="Ej: Estructuras, Revestimientos, Instalaciones..."
                      value={draft.categoria}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, categoria: e.target.value }))
                      }
                    />
                  </div>

                  {/* Entregar en */}
                  <div className="space-y-2">
                    <Label>Entregar en *</Label>
                    <Input
                      placeholder="Ej: Obra Norte, Av. Reforma 123"
                      value={draft.deliveryLocation}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, deliveryLocation: e.target.value }))
                      }
                    />
                  </div>

                  {/* Condiciones: precio + pago */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Condición de precios *</Label>
                      <Select
                        value={draft.priceTerms}
                        onValueChange={(v) =>
                          setDraft((prev) => ({ ...prev, priceTerms: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PRICE_TERMS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Condición de pago *</Label>
                      <Select
                        value={draft.paymentTerms}
                        onValueChange={(v) =>
                          setDraft((prev) => ({ ...prev, paymentTerms: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_TERMS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Observaciones generales (notas para proveedores) */}
                  <div className="space-y-2">
                    <Label>Observaciones generales</Label>
                    <Textarea
                      placeholder="Notas para los proveedores..."
                      value={draft.notes}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      rows={2}
                    />
                  </div>

                  {/* Proveedores invitados (only for closed_bid) */}
                  {draft.rfqType === "closed_bid" && providers.length > 0 && (
                    <div className="space-y-2">
                      <Label>Proveedores invitados</Label>
                      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border rounded-lg p-2">
                        {providers.map((p) => (
                          <Button
                            key={p.id}
                            type="button"
                            variant={
                              draft.selectedProviders.includes(p.id) ? "default" : "outline"
                            }
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => toggleProvider(p.id)}
                          >
                            {p.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Documentación adjunta — files are local state only, not persisted */}
                  <div className="space-y-2">
                    <Label>Documentación adjunta</Label>
                    <div className="border border-dashed rounded-lg p-3 text-center">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        id="rfq-nuevo-upload"
                        onChange={(e) => {
                          const newFiles = Array.from(e.target.files || []);
                          setFiles((prev) => [...prev, ...newFiles]);
                          e.target.value = "";
                        }}
                      />
                      <label htmlFor="rfq-nuevo-upload" className="cursor-pointer">
                        <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          Click para adjuntar archivos
                        </p>
                      </label>
                    </div>
                    {files.length > 0 && (
                      <div className="space-y-1">
                        {files.map((f, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-sm border rounded px-2 py-1"
                          >
                            <span className="truncate">{f.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 shrink-0"
                              onClick={() =>
                                setFiles((prev) => prev.filter((_, idx) => idx !== i))
                              }
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ----------------------------------------------------------------
                Section 2 — Productos (gated on isDetalleComplete)
            ---------------------------------------------------------------- */}
            <AccordionItem value="productos" disabled={!detalleComplete}>
              <AccordionTrigger
                className="hover:no-underline disabled:opacity-50 disabled:pointer-events-none"
                disabled={!detalleComplete}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <SectionStatusIcon complete={itemsComplete} />
                  Productos
                  {!detalleComplete && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (completá el Detalle primero)
                    </span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label>Materiales *</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem}>
                      <Plus className="h-3 w-3 mr-1" />
                      Agregar
                    </Button>
                  </div>

                  {draft.items.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      Agregá al menos un material para poder emitir la solicitud.
                    </p>
                  )}

                  {draft.items.map((item, i) => (
                    <div key={i} className="space-y-2 rounded-lg border p-3">
                      <div className="flex gap-2 items-center">
                        <div className="flex-1">
                          <Select
                            value={item.material_id}
                            onValueChange={(v) => selectMaterial(i, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar material..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allMaterials?.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input
                          className="w-20"
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Cant."
                          value={item.quantity}
                          onChange={(e) => updateItemField(i, "quantity", e.target.value)}
                        />
                        <span className="text-sm text-muted-foreground w-10 shrink-0 text-center">
                          {item.unit || "—"}
                        </span>
                        {draft.items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(i)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      {/* Per-item observations */}
                      <Input
                        placeholder="Observaciones del ítem (opcional)..."
                        value={item.observations}
                        onChange={(e) => updateItemField(i, "observations", e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* ----------------------------------------------------------------
              Actions
          ---------------------------------------------------------------- */}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="submit"
              className="w-full"
              disabled={createAndSend.isPending || !detalleComplete || !itemsComplete}
            >
              <Send className="h-4 w-4 mr-2" />
              {createAndSend.isPending ? "Enviando..." : "Emitir y Enviar a Proveedores"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={handleDiscard}
            >
              Descartar borrador
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
