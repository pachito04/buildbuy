import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useBasket } from "@/contexts/BasketContext";
import { ShoppingCart, Trash2, Send } from "lucide-react";

interface RfqCestaProps {
  companyId: string | null;
  providers: any[];
}

export function RfqCesta({ companyId, providers }: RfqCestaProps) {
  const basket = useBasket();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [rfqType, setRfqType] = useState<"open" | "closed_bid">("open");
  const [deadline, setDeadline] = useState("");
  const [closingDatetime, setClosingDatetime] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  const emitFromBasket = useMutation({
    mutationFn: async () => {
      if (basket.items.length === 0) throw new Error("La cesta está vacía");
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

      const rfqItems = basket.items.map((bi) => ({
        rfq_id: rfqId,
        description: bi.name,
        quantity: bi.quantity,
        unit: bi.unit,
        material_id: bi.material_id,
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

      try {
        await supabase.functions.invoke("notify-providers", {
          body: { type: "rfq_sent", rfq_id: rfqId },
        });
      } catch (e) {
        console.warn("Email notification failed:", e);
      }

      basket.clear();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      setDeadline("");
      setClosingDatetime("");
      setDeliveryLocation("");
      setNotes("");
      setSelectedProviders([]);
      toast({
        title: "Solicitud enviada",
        description: "La cesta fue enviada a proveedores automáticamente.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleProvider = (id: string) => {
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  if (basket.items.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12 text-muted-foreground">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">La cesta de cotización está vacía.</p>
          <p className="text-xs mt-1">
            Agregá materiales desde el módulo de Inventario o Materiales.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display">Cesta de Cotización</CardTitle>
            <Badge variant="outline">{basket.totalItems} material(es)</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Material</th>
                  <th className="text-right px-3 py-2">Cantidad</th>
                  <th className="text-left px-3 py-2">Unidad</th>
                  <th className="text-center px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {basket.items.map((item) => (
                  <tr key={item.material_id} className="border-t">
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="text-right px-3 py-2">
                      <Input
                        className="w-20 h-7 text-right inline-block"
                        type="number"
                        min="1"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => basket.updateQuantity(item.material_id, parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="px-3 py-2">{item.unit}</td>
                    <td className="px-3 py-2 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => basket.removeItem(item.material_id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-display">Datos de la solicitud</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); emitFromBasket.mutate(); }} className="space-y-4">
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

            <Button type="submit" className="w-full" disabled={emitFromBasket.isPending}>
              <Send className="h-4 w-4 mr-2" />
              {emitFromBasket.isPending ? "Enviando..." : "Emitir y Enviar a Proveedores"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
