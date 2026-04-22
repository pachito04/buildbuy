import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Send, Eye, ShoppingCart } from "lucide-react";
import { useBasket } from "@/contexts/BasketContext";

const rfqStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "secondary" },
  sent: { label: "Enviado", variant: "default" },
  responded: { label: "Respondido", variant: "outline" },
  closed: { label: "Cerrado", variant: "destructive" },
};

export default function RFQs() {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [source, setSource] = useState<"pool" | "request" | "basket">("request");
  const [basketWarningOpen, setBasketWarningOpen] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [closingDatetime, setClosingDatetime] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const basket = useBasket();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const companyId = profile?.company_id;

  const { data: rfqs, isLoading } = useQuery({
    queryKey: ["rfqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select("*, rfq_items(*), rfq_providers(*, providers:provider_id(name, email)), purchase_pools:pool_id(name), requests:request_id(raw_message)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: closedPools } = useQuery({
    queryKey: ["closed-pools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_pools")
        .select("*, pool_requests(*, requests:request_id(*, request_items(*)))")
        .eq("status", "closed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: approvedRequests } = useQuery({
    queryKey: ["approved-requests-rfq"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("*, request_items(*)")
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["providers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("id, name, email, categories")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createRfq = useMutation({
    mutationFn: async () => {
      let items: { description: string; quantity: number; unit: string; material_id?: string }[] = [];

      if (source === "basket") {
        if (basket.items.length === 0) throw new Error("La cesta está vacía");
        items = basket.items.map((bi) => ({
          description: bi.name,
          quantity: bi.quantity,
          unit: bi.unit,
          material_id: bi.material_id,
        }));
      } else if (source === "pool" && selectedPoolId) {
        const pool = closedPools?.find((p) => p.id === selectedPoolId);
        const poolReqs = (pool?.pool_requests as any[]) || [];
        const allItems = poolReqs.flatMap((pr: any) => pr.requests?.request_items || []);
        const consolidated: Record<string, { description: string; quantity: number; unit: string }> = {};
        allItems.forEach((item: any) => {
          const key = `${item.description.toLowerCase()}_${item.unit}`;
          if (!consolidated[key]) consolidated[key] = { description: item.description, quantity: 0, unit: item.unit };
          consolidated[key].quantity += Number(item.quantity);
        });
        items = Object.values(consolidated);
      } else if (source === "request" && selectedRequestId) {
        const req = approvedRequests?.find((r) => r.id === selectedRequestId);
        items = (req?.request_items || []).map((it: any) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unit: it.unit,
        }));
      }

      if (items.length === 0) throw new Error("No hay ítems para el RFQ");
      if (selectedProviders.length === 0) throw new Error("Selecciona al menos un proveedor");
      if (!companyId) throw new Error("Usuario sin empresa asignada");

      // Create RFQ
      const { data: rfq, error } = await supabase
        .from("rfqs")
        .insert({
          company_id: companyId,
          pool_id: source === "pool" ? selectedPoolId : null,
          request_id: source === "request" ? selectedRequestId : null,
          deadline: deadline || null,
          closing_datetime: closingDatetime || null,
          delivery_location: deliveryLocation || null,
          observations: notes || null,
          created_by: user?.id,
          status: "draft",
        } as any)
        .select()
        .single();
      if (error) throw error;

      const rfqItems = items.map((it) => ({
        rfq_id: (rfq as any).id,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        ...(it.material_id ? { material_id: it.material_id } : {}),
      }));
      const { error: itemsErr } = await supabase.from("rfq_items").insert(rfqItems);
      if (itemsErr) throw itemsErr;

      // Insert RFQ providers
      const rfqProviders = selectedProviders.map((pid) => ({
        rfq_id: (rfq as any).id,
        provider_id: pid,
      }));
      const { error: provErr } = await supabase.from("rfq_providers").insert(rfqProviders);
      if (provErr) throw provErr;

      // Update source status
      if (source === "pool" && selectedPoolId) {
        await supabase.from("purchase_pools").update({ status: "quoting" as any }).eq("id", selectedPoolId);
      } else if (source === "request" && selectedRequestId) {
        await supabase.from("requests").update({ status: "rfq_direct" as any }).eq("id", selectedRequestId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["closed-pools"] });
      qc.invalidateQueries({ queryKey: ["approved-requests-rfq"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["pools"] });
      if (source === "basket") basket.clear();
      resetForm();
      toast({ title: "RFQ creado exitosamente" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendRfq = useMutation({
    mutationFn: async (rfqId: string) => {
      const { error } = await supabase.from("rfqs").update({ status: "sent" as any }).eq("id", rfqId);
      if (error) throw error;

      // Notify providers via email
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
      toast({ title: "RFQ enviado a proveedores", description: "Se enviaron notificaciones por email." });
    },
  });

  const resetForm = () => {
    setCreateOpen(false);
    setBasketWarningOpen(false);
    setSource("request");
    setSelectedPoolId("");
    setSelectedRequestId("");
    setDeadline("");
    setClosingDatetime("");
    setDeliveryLocation("");
    setNotes("");
    setSelectedProviders([]);
  };

  const toggleProvider = (id: string) => {
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const detailRfq = rfqs?.find((r) => r.id === detailId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Solicitudes de Cotización</h1>
          <p className="text-muted-foreground text-sm mt-1">RFQs enviados a proveedores — desde pools o pedidos directos</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => (o ? setCreateOpen(true) : resetForm())}>
          <DialogTrigger asChild>
            <Button
              onClick={(e) => {
                if (basket.totalItems > 0 && !createOpen) {
                  e.preventDefault();
                  setBasketWarningOpen(true);
                }
              }}
            >
              <Plus className="h-4 w-4 mr-2" />Generar RFQ
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nuevo RFQ</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createRfq.mutate(); }} className="space-y-4">
              {/* Source selection */}
              <div className="space-y-2">
                <Label>Origen del RFQ *</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={source === "request" ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSource("request"); setSelectedPoolId(""); }}
                  >
                    Pedido Directo
                  </Button>
                  <Button
                    type="button"
                    variant={source === "pool" ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSource("pool"); setSelectedRequestId(""); }}
                  >
                    Desde Pool
                  </Button>
                  <Button
                    type="button"
                    variant={source === "basket" ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSource("basket"); setSelectedPoolId(""); setSelectedRequestId(""); }}
                    disabled={basket.totalItems === 0}
                  >
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    Desde Cesta ({basket.totalItems})
                  </Button>
                </div>
              </div>

              {/* Source selector */}
              {source === "pool" && (
                <div className="space-y-2">
                  <Label>Pool cerrado *</Label>
                  <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar pool..." /></SelectTrigger>
                    <SelectContent>
                      {closedPools?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!closedPools?.length && (
                    <p className="text-xs text-muted-foreground">No hay pools cerrados disponibles.</p>
                  )}
                </div>
              )}

              {source === "request" && (
                <div className="space-y-2">
                  <Label>Pedido aprobado *</Label>
                  <Select value={selectedRequestId} onValueChange={setSelectedRequestId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar pedido..." /></SelectTrigger>
                    <SelectContent>
                      {approvedRequests?.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          #{r.id.slice(0, 8)} — {r.request_items?.length || 0} ítems
                          {r.raw_message ? ` — ${r.raw_message.slice(0, 40)}...` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!approvedRequests?.length && (
                    <p className="text-xs text-muted-foreground">No hay pedidos aprobados disponibles.</p>
                  )}
                </div>
              )}

              {source === "basket" && basket.totalItems > 0 && (
                <div className="space-y-2">
                  <Label>Materiales en la cesta</Label>
                  <div className="border rounded-lg p-2 space-y-1 max-h-32 overflow-y-auto">
                    {basket.items.map((bi) => (
                      <div key={bi.material_id} className="flex justify-between text-sm">
                        <span>{bi.name}</span>
                        <span className="text-muted-foreground">{bi.quantity} {bi.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RFQ details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha límite de respuesta</Label>
                  <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cierre de cotización</Label>
                  <Input type="datetime-local" value={closingDatetime} onChange={(e) => setClosingDatetime(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ubicación de entrega</Label>
                <Input placeholder="Ej: Obra Norte, Av. Reforma 123, CDMX" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Observaciones</Label>
                <Textarea placeholder="Notas adicionales para los proveedores..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {/* Provider selection */}
              <div className="space-y-2">
                <Label>Proveedores a cotizar *</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                  {providers?.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                      <Checkbox
                        checked={selectedProviders.includes(p.id)}
                        onCheckedChange={() => toggleProvider(p.id)}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.email || "Sin email"}</p>
                      </div>
                      {p.categories && (p.categories as string[]).length > 0 && (
                        <div className="flex gap-1">
                          {(p.categories as string[]).slice(0, 2).map((c: string) => (
                            <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {!providers?.length && (
                    <p className="text-xs text-muted-foreground p-2">No hay proveedores registrados.</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{selectedProviders.length} proveedor(es) seleccionado(s)</p>
              </div>

              <Button type="submit" className="w-full" disabled={createRfq.isPending}>
                {createRfq.isPending ? "Creando..." : "Crear RFQ"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Basket warning dialog */}
      <Dialog open={basketWarningOpen} onOpenChange={setBasketWarningOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tenés materiales en la cesta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Hay {basket.totalItems} material(es) en tu cesta de cotización. ¿Querés generar el RFQ desde la cesta?
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                setBasketWarningOpen(false);
                setSource("basket");
                setCreateOpen(true);
              }}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />Usar cesta
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setBasketWarningOpen(false);
                setSource("request");
                setCreateOpen(true);
              }}
            >
              Crear sin cesta
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Detalle del RFQ</DialogTitle>
          </DialogHeader>
          {detailRfq && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">#{detailRfq.id.slice(0, 8)}</span>
                <Badge variant={rfqStatusLabels[detailRfq.status]?.variant || "secondary"}>
                  {rfqStatusLabels[detailRfq.status]?.label || detailRfq.status}
                </Badge>
              </div>

              {(detailRfq as any).purchase_pools?.name && (
                <p className="text-sm"><span className="text-muted-foreground">Pool:</span> {(detailRfq as any).purchase_pools.name}</p>
              )}
              {(detailRfq as any).requests?.raw_message && (
                <p className="text-sm"><span className="text-muted-foreground">Pedido:</span> {(detailRfq as any).requests.raw_message.slice(0, 100)}</p>
              )}
              {(detailRfq as any).delivery_location && (
                <p className="text-sm"><span className="text-muted-foreground">Entrega:</span> {(detailRfq as any).delivery_location}</p>
              )}
              {(detailRfq as any).closing_datetime && (
                <p className="text-sm"><span className="text-muted-foreground">Cierre:</span> {new Date((detailRfq as any).closing_datetime).toLocaleString("es-MX")}</p>
              )}
              {(detailRfq as any).observations && (
                <p className="text-sm"><span className="text-muted-foreground">Notas:</span> {(detailRfq as any).observations}</p>
              )}

              {/* Items */}
              {detailRfq.rfq_items && (detailRfq.rfq_items as any[]).length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-3 py-2 text-xs font-medium">Ítems</div>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-1.5">Descripción</th>
                        <th className="text-right px-3 py-1.5">Cantidad</th>
                        <th className="text-left px-3 py-1.5">Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailRfq.rfq_items as any[]).map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-1.5">{item.description}</td>
                          <td className="text-right px-3 py-1.5 font-medium">{item.quantity}</td>
                          <td className="px-3 py-1.5">{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Providers */}
              {detailRfq.rfq_providers && (detailRfq.rfq_providers as any[]).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Proveedores:</p>
                  <div className="flex flex-wrap gap-2">
                    {(detailRfq.rfq_providers as any[]).map((rp: any) => (
                      <Badge key={rp.id} variant="secondary">{rp.providers?.name || "Proveedor"}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {detailRfq.status === "draft" && (
                <Button className="w-full" onClick={() => { sendRfq.mutate(detailRfq.id); setDetailId(null); }}>
                  <Send className="h-4 w-4 mr-2" />Enviar RFQ a Proveedores
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* RFQ List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : !rfqs?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No hay RFQs generados.</p>
            <p className="text-xs mt-1">Genera un RFQ desde un pool cerrado o un pedido aprobado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rfqs.map((rfq) => (
            <Card key={rfq.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetailId(rfq.id)}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-display">#{rfq.id.slice(0, 8)}</CardTitle>
                  <Badge variant={rfqStatusLabels[rfq.status]?.variant || "secondary"}>
                    {rfqStatusLabels[rfq.status]?.label || rfq.status}
                  </Badge>
                  {rfq.pool_id && (
                    <Badge variant="outline" className="text-xs">
                      Pool: {(rfq as any).purchase_pools?.name || rfq.pool_id.slice(0, 8)}
                    </Badge>
                  )}
                  {rfq.request_id && !rfq.pool_id && (
                    <Badge variant="outline" className="text-xs">Directo</Badge>
                  )}
                  {!rfq.request_id && !rfq.pool_id && (
                    <Badge variant="outline" className="text-xs">
                      <ShoppingCart className="h-3 w-3 mr-1" />Desde Cesta
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{(rfq.rfq_items as any[])?.length || 0} ítems</span>
                  <span>{(rfq.rfq_providers as any[])?.length || 0} proveedores</span>
                  <span>{new Date(rfq.created_at).toLocaleDateString("es-MX")}</span>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {(rfq as any).delivery_location && <span>📍 {(rfq as any).delivery_location}</span>}
                  {rfq.deadline && <span>📅 Límite: {new Date(rfq.deadline).toLocaleDateString("es-MX")}</span>}
                  {(rfq as any).closing_datetime && <span>⏰ Cierre: {new Date((rfq as any).closing_datetime).toLocaleString("es-MX")}</span>}
                </div>
                {rfq.notes && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{rfq.notes}</p>}
                <div className="flex gap-2 mt-2">
                  {rfq.status === "draft" && (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); sendRfq.mutate(rfq.id); }}>
                      <Send className="h-3 w-3 mr-1" />Enviar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setDetailId(rfq.id); }}>
                    <Eye className="h-3 w-3 mr-1" />Ver Detalle
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
