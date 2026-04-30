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
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Send, Upload, X } from "lucide-react";

interface ItemRow {
  material_id: string;
  description: string;
  quantity: string;
  unit: string;
}

const EMPTY_ITEM: ItemRow = { material_id: "", description: "", quantity: "1", unit: "" };

interface RfqNuevoProps {
  companyId: string | null;
  providers: any[];
}

export function RfqNuevo({ companyId, providers }: RfqNuevoProps) {
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [rfqType, setRfqType] = useState<"open" | "closed_bid">("open");
  const [deadline, setDeadline] = useState("");
  const [closingDatetime, setClosingDatetime] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

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

  const createAndSend = useMutation({
    mutationFn: async () => {
      const validItems = items.filter((i) => i.material_id);
      if (!validItems.length) throw new Error("Agregá al menos un material");
      if (!closingDatetime) throw new Error("La fecha de cierre de cotización es obligatoria");
      if (!deadline) throw new Error("La fecha límite de entrega es obligatoria");
      if (!deliveryLocation.trim()) throw new Error("El lugar de entrega es obligatorio");
      if (!companyId) throw new Error("Usuario sin empresa asignada");

      const { data: rfq, error } = await supabase
        .from("rfqs")
        .insert({
          company_id: companyId,
          rfq_type: rfqType,
          deadline: deadline || null,
          closing_datetime: closingDatetime || null,
          delivery_location: deliveryLocation || null,
          observations: notes || null,
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
      }));
      const { error: itemsErr } = await supabase.from("rfq_items").insert(rfqItems);
      if (itemsErr) throw itemsErr;

      if (selectedProviders.length > 0) {
        const rfqProviders = selectedProviders.map((pid) => ({
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
      resetForm();
      toast({
        title: "Solicitud enviada",
        description: "La solicitud fue creada y enviada a proveedores automáticamente.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setItems([{ ...EMPTY_ITEM }]);
    setRfqType("open");
    setDeadline("");
    setClosingDatetime("");
    setDeliveryLocation("");
    setNotes("");
    setSelectedProviders([]);
    setFiles([]);
  };

  const addItem = () => setItems([...items, { ...EMPTY_ITEM }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const selectMaterial = (i: number, materialId: string) => {
    const mat = allMaterials?.find((m) => m.id === materialId);
    const existingIdx = items.findIndex((it, idx) => idx !== i && it.material_id === materialId);
    if (existingIdx !== -1) {
      const copy = [...items];
      const currentQty = parseFloat(copy[existingIdx].quantity) || 1;
      const addedQty = parseFloat(copy[i].quantity) || 1;
      copy[existingIdx] = { ...copy[existingIdx], quantity: String(currentQty + addedQty) };
      copy.splice(i, 1);
      setItems(copy.length ? copy : [{ ...EMPTY_ITEM }]);
      toast({
        title: "Material combinado",
        description: "Se sumaron las cantidades del material repetido.",
      });
      return;
    }
    const copy = [...items];
    copy[i] = {
      material_id: materialId,
      description: mat?.name ?? "",
      unit: mat?.unit ?? "",
      quantity: copy[i].quantity || "1",
    };
    setItems(copy);
  };

  const toggleProvider = (id: string) => {
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-display">Nueva Solicitud de Cotización</CardTitle>
        <p className="text-xs text-muted-foreground">
          Seleccioná materiales del catálogo. Al emitir, se envía automáticamente a proveedores.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); createAndSend.mutate(); }} className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Materiales *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" />Agregar
              </Button>
            </div>
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="flex-1">
                  <Select value={item.material_id} onValueChange={(v) => selectMaterial(i, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar material..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allMaterials?.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
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
                  onChange={(e) => {
                    const copy = [...items];
                    copy[i] = { ...copy[i], quantity: e.target.value };
                    setItems(copy);
                  }}
                />
                <span className="text-sm text-muted-foreground w-10 shrink-0 text-center">
                  {item.unit || "—"}
                </span>
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Tipo de solicitud *</Label>
            <Select value={rfqType} onValueChange={(v) => setRfqType(v as "open" | "closed_bid")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Pedido Abierto</SelectItem>
                <SelectItem value="closed_bid">Licitación Cerrada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cierre de cotización *</Label>
              <Input type="datetime-local" value={closingDatetime} onChange={(e) => setClosingDatetime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Entrega límite *</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lugar de entrega *</Label>
            <Input placeholder="Ej: Obra Norte, Av. Reforma 123" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Observaciones</Label>
            <Textarea placeholder="Notas para los proveedores..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {rfqType === "closed_bid" && providers.length > 0 && (
            <div className="space-y-2">
              <Label>Proveedores invitados</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border rounded-lg p-2">
                {providers.map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    variant={selectedProviders.includes(p.id) ? "default" : "outline"}
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
                <p className="text-xs text-muted-foreground">Click para adjuntar archivos</p>
              </label>
            </div>
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={createAndSend.isPending}>
            <Send className="h-4 w-4 mr-2" />
            {createAndSend.isPending ? "Enviando..." : "Emitir y Enviar a Proveedores"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
