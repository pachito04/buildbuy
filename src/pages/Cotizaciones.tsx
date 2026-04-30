import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useViewRole } from "@/hooks/useViewRole";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Send, ShoppingCart, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAwardCart } from "@/contexts/AwardCartContext";
import { ComparativaGrid } from "@/components/cotizaciones/ComparativaGrid";
import { ComparativaDetail } from "@/components/cotizaciones/ComparativaDetail";

export default function Cotizaciones() {
  const { viewRole: role, companyId } = useViewRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const cart = useAwardCart();

  const [tab, setTab] = useState<"comparativas" | "carrito">("comparativas");
  const [selectedRfq, setSelectedRfq] = useState<any>(null);

  // --- Proveedor state ---
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [quoteRfqId, setQuoteRfqId] = useState("");
  const [quoteDeliveryDays, setQuoteDeliveryDays] = useState("");
  const [quoteConditions, setQuoteConditions] = useState("");
  const [quoteItems, setQuoteItems] = useState<{ rfq_item_id: string; unit_price: string }[]>([]);
  const [detailRfqId, setDetailRfqId] = useState<string | null>(null);

  // --- Provider record (proveedor) ---
  const { data: myProvider } = useQuery({
    queryKey: ["my-provider", user?.id],
    enabled: role === "proveedor" && !!user,
    queryFn: async () => {
      const { data: pu } = await supabase
        .from("provider_users")
        .select("provider_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (pu) return { id: pu.provider_id };
      const { data: p } = await supabase
        .from("providers")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return p ? { id: p.id } : null;
    },
  });

  // --- Proveedor: RFQs to quote on ---
  const { data: provRfqs } = useQuery({
    queryKey: ["rfqs-proveedor", myProvider?.id],
    enabled: role === "proveedor" && !!myProvider,
    queryFn: async () => {
      const { data: invites } = await supabase.from("rfq_providers").select("rfq_id").eq("provider_id", myProvider!.id);
      const invitedIds = (invites || []).map((i) => i.rfq_id);

      const { data: openRfqs } = await supabase
        .from("rfqs")
        .select("id, status, created_at, pool_id, request_id, delivery_location, observations, deadline, closing_datetime, rfq_type, purchase_pools:pool_id(name), requests:request_id(request_number)")
        .or("rfq_type.eq.open,rfq_type.is.null")
        .in("status", ["sent", "responded"])
        .order("created_at", { ascending: false });

      let closedRfqs: any[] = [];
      if (invitedIds.length) {
        const { data } = await supabase
          .from("rfqs")
          .select("id, status, created_at, pool_id, request_id, delivery_location, observations, deadline, closing_datetime, rfq_type, purchase_pools:pool_id(name), requests:request_id(request_number)")
          .eq("rfq_type", "closed_bid")
          .in("id", invitedIds)
          .in("status", ["sent", "responded"])
          .order("created_at", { ascending: false });
        closedRfqs = data || [];
      }

      const allRfqs = [...(openRfqs || []), ...closedRfqs];
      allRfqs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (allRfqs.length) {
        const rfqIds = allRfqs.map((r) => r.id);
        const { data: items } = await supabase.from("rfq_items").select("*").in("rfq_id", rfqIds);
        return allRfqs.map((r) => ({ ...r, rfq_items: (items || []).filter((i) => i.rfq_id === r.id) }));
      }
      return allRfqs;
    },
  });

  // --- Proveedor: submit quote ---
  const submitQuote = useMutation({
    mutationFn: async () => {
      if (!myProvider) throw new Error("No se encontró tu registro de proveedor");
      const totalPrice = quoteItems.reduce((sum, qi) => sum + (parseFloat(qi.unit_price) || 0), 0);
      const { data: quote, error } = await supabase
        .from("quotes")
        .insert({ rfq_id: quoteRfqId, provider_id: myProvider.id, delivery_days: parseInt(quoteDeliveryDays) || null, conditions: quoteConditions || null, total_price: totalPrice })
        .select()
        .single();
      if (error) throw error;
      const items = quoteItems.filter((qi) => parseFloat(qi.unit_price) > 0).map((qi) => ({ quote_id: quote.id, rfq_item_id: qi.rfq_item_id, unit_price: parseFloat(qi.unit_price) }));
      if (items.length) {
        const { error: ie } = await supabase.from("quote_items").insert(items);
        if (ie) throw ie;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs-proveedor"] });
      setQuoteDialogOpen(false);
      toast({ title: "Cotización enviada" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openQuoteDialog = (rfq: any) => {
    setQuoteRfqId(rfq.id);
    setQuoteDeliveryDays("");
    setQuoteConditions("");
    setQuoteItems((rfq.rfq_items || []).map((i: any) => ({ rfq_item_id: i.id, unit_price: "" })));
    setQuoteDialogOpen(true);
  };

  // --- Compras/Admin: RFQs with quotes (for comparativas grid) ---
  const { data: comparativaRfqs, isLoading: comparativasLoading } = useQuery({
    queryKey: ["comparativa-rfqs", companyId],
    enabled: role !== "proveedor" && !!companyId,
    queryFn: async () => {
      const { data: rfqs, error } = await supabase
        .from("rfqs")
        .select("id, status, created_at, closing_datetime, observations, created_by, request_id, pool_id, requests:request_id(request_number), purchase_pools:pool_id(name)")
        .eq("company_id", companyId!)
        .in("status", ["sent", "responded", "closed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!rfqs?.length) return [];

      const rfqIds = rfqs.map((r) => r.id);
      const creatorIds = [...new Set(rfqs.map((r) => r.created_by).filter(Boolean))] as string[];

      const [quotesRes, profilesRes] = await Promise.all([
        supabase.from("quotes").select("rfq_id").in("rfq_id", rfqIds).in("status", ["pending", "submitted", "awarded"] as any),
        creatorIds.length ? supabase.from("profiles").select("id, full_name").in("id", creatorIds) : Promise.resolve({ data: [] }),
      ]);

      const quoteCounts = new Map<string, number>();
      for (const q of quotesRes.data ?? []) {
        quoteCounts.set(q.rfq_id, (quoteCounts.get(q.rfq_id) || 0) + 1);
      }

      const profileMap = new Map<string, string>();
      for (const p of (profilesRes as any).data ?? []) {
        profileMap.set(p.id, p.full_name || "");
      }

      const rows = rfqs.map((r: any) => ({
        id: r.id,
        request_number: r.requests?.request_number ?? null,
        label: r.requests?.request_number
          ? `Pedido #${r.requests.request_number}`
          : r.purchase_pools?.name
            ? `Pool: ${r.purchase_pools.name}`
            : `SC #${r.id.slice(0, 8)}`,
        created_at: r.created_at,
        closing_datetime: r.closing_datetime,
        description: r.observations,
        creator_name: r.created_by ? profileMap.get(r.created_by) || null : null,
        quote_count: quoteCounts.get(r.id) || 0,
        status: r.status,
      }));
      return rows;
    },
  });

  // --- Compras/Admin: generate OC from cart ---
  const generateOC = useMutation({
    mutationFn: async (providerId: string) => {
      const providerItems = cart.items.filter((i) => i.provider_id === providerId);
      if (!providerItems.length) throw new Error("No hay productos para este proveedor");
      if (!companyId) throw new Error("No se pudo determinar la empresa");

      const totalAmount = providerItems.reduce((sum, i) => sum + i.unit_price, 0);

      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId,
          provider_id: providerId,
          rfq_id: providerItems[0].rfq_id,
          total_amount: totalAmount,
          created_by: user?.id,
        })
        .select()
        .single();
      if (poErr) throw poErr;

      const poItems = providerItems.map((i) => ({
        purchase_order_id: po.id,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        quote_item_id: i.quote_item_id,
      }));
      const { error: itemsErr } = await supabase.from("purchase_order_items").insert(poItems);
      if (itemsErr) throw itemsErr;

      cart.removeByProvider(providerId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Orden de compra generada", description: "La OC fue creada y enviada al proveedor." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // --- Cart grouped by provider ---
  const cartByProvider = useMemo(() => {
    const map = new Map<string, { provider_name: string; items: typeof cart.items }>();
    for (const item of cart.items) {
      const group = map.get(item.provider_id);
      if (group) {
        group.items.push(item);
      } else {
        map.set(item.provider_id, { provider_name: item.provider_name, items: [item] });
      }
    }
    return Array.from(map.entries()).map(([id, g]) => ({ provider_id: id, ...g }));
  }, [cart.items]);

  // =====================================================
  // PROVEEDOR VIEW
  // =====================================================
  if (role === "proveedor") {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Cotizaciones</h1>
          <p className="text-muted-foreground text-sm mt-1">Solicitudes de cotizaciones vigentes — envía tus cotizaciones</p>
        </div>

        {!provRfqs?.length ? (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              <Send className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-sm">No tienes solicitudes de cotización pendientes.</p>
              <p className="text-xs mt-1">Aparecerán aquí cuando haya solicitudes de cotización disponibles.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {provRfqs.map((rfq: any) => (
              <Card key={rfq.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetailRfqId(rfq.id)}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle className="text-sm font-display">
                      {rfq.requests?.request_number
                        ? `Pedido #${rfq.requests.request_number}`
                        : rfq.purchase_pools?.name
                          ? `Pool: ${rfq.purchase_pools.name}`
                          : `SC #${rfq.id.slice(0, 8)}`}
                    </CardTitle>
                    <Badge variant={rfq.status === "sent" ? "default" : "outline"}>
                      {rfq.status === "sent" ? "Abierto" : "Respondido"}
                    </Badge>
                    {rfq.rfq_type === "closed_bid" && (
                      <Badge variant="secondary" className="text-[10px]">Licitación Cerrada</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(rfq.created_at).toLocaleDateString("es-AR")}</span>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                    {rfq.delivery_location && <span className="truncate max-w-[200px]">📍 {rfq.delivery_location}</span>}
                    {rfq.deadline && <span>📅 Entrega: {new Date(rfq.deadline).toLocaleDateString("es-AR")}</span>}
                    {rfq.closing_datetime && <span>⏰ Cierre: {new Date(rfq.closing_datetime).toLocaleString("es-AR")}</span>}
                    <span>{rfq.rfq_items?.length || 0} producto{rfq.rfq_items?.length !== 1 ? "s" : ""}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* RFQ detail dialog */}
        <Dialog open={!!detailRfqId} onOpenChange={(o) => { if (!o) setDetailRfqId(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Detalle de la Solicitud</DialogTitle>
            </DialogHeader>
            {(() => {
              const rfq = provRfqs?.find((r: any) => r.id === detailRfqId);
              if (!rfq) return null;
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {rfq.requests?.request_number
                        ? `Pedido #${rfq.requests.request_number}`
                        : rfq.purchase_pools?.name
                          ? `Pool: ${rfq.purchase_pools.name}`
                          : `SC #${rfq.id.slice(0, 8)}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant={rfq.status === "sent" ? "default" : "outline"}>
                        {rfq.status === "sent" ? "Abierto" : "Respondido"}
                      </Badge>
                      {rfq.rfq_type === "closed_bid" && (
                        <Badge variant="secondary" className="text-[10px]">Licitación Cerrada</Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {rfq.delivery_location && <p className="break-all"><span className="text-muted-foreground">Entrega:</span> {rfq.delivery_location}</p>}
                    {rfq.deadline && <p><span className="text-muted-foreground">Fecha entrega:</span> {new Date(rfq.deadline).toLocaleDateString("es-AR")}</p>}
                    {rfq.closing_datetime && <p><span className="text-muted-foreground">Cierre:</span> {new Date(rfq.closing_datetime).toLocaleString("es-AR")}</p>}
                    <p><span className="text-muted-foreground">Creado:</span> {new Date(rfq.created_at).toLocaleDateString("es-AR")}</p>
                  </div>
                  {rfq.observations && <p className="text-sm"><span className="text-muted-foreground">Observaciones:</span> {rfq.observations}</p>}
                  {rfq.rfq_items?.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted px-3 py-2 text-xs font-medium">Materiales</div>
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-1.5">Material</th>
                            <th className="text-right px-3 py-1.5">Cantidad</th>
                            <th className="text-left px-3 py-1.5">Unidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rfq.rfq_items.map((item: any) => (
                            <tr key={item.id} className="border-t">
                              <td className="px-3 py-1.5">{item.description}</td>
                              <td className="text-right px-3 py-1.5 font-medium">{item.quantity}</td>
                              <td className="px-3 py-1.5">{item.unit || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <Button size="sm" className="w-full" onClick={() => { setDetailRfqId(null); openQuoteDialog(rfq); }}>
                    <Send className="h-3 w-3 mr-1" />Enviar Cotización
                  </Button>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Quote submission dialog */}
        <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Enviar Cotización</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); submitQuote.mutate(); }} className="space-y-4">
              {quoteItems.map((qi, i) => {
                const rfq = provRfqs?.find((r: any) => r.id === quoteRfqId);
                const rfqItem = rfq?.rfq_items?.find((it: any) => it.id === qi.rfq_item_id);
                return (
                  <div key={qi.rfq_item_id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{rfqItem?.description || "Ítem"}</p>
                      <p className="text-xs text-muted-foreground">{rfqItem?.quantity} {rfqItem?.unit}</p>
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Precio unit."
                        value={qi.unit_price}
                        onChange={(e) => {
                          const copy = [...quoteItems];
                          copy[i] = { ...copy[i], unit_price: e.target.value };
                          setQuoteItems(copy);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Días de entrega</Label>
                  <Input type="number" placeholder="Ej: 5" value={quoteDeliveryDays} onChange={(e) => setQuoteDeliveryDays(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Total</Label>
                  <Input disabled value={`$${quoteItems.reduce((s, qi) => s + (parseFloat(qi.unit_price) || 0), 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Condiciones</Label>
                <Textarea placeholder="Condiciones de pago, vigencia, etc." value={quoteConditions} onChange={(e) => setQuoteConditions(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={submitQuote.isPending}>
                {submitQuote.isPending ? "Enviando..." : "Enviar Cotización"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // =====================================================
  // COMPRAS / ADMIN VIEW — TABS
  // =====================================================
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Cotizaciones</h1>
          <p className="text-muted-foreground text-sm mt-1">Comparativas de cotizaciones y carrito de compras</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === "comparativas" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("comparativas")}
        >
          <BarChart3 className="h-4 w-4" />
          Comparativas
          {(comparativaRfqs?.filter((r) => r.quote_count > 0).length ?? 0) > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {comparativaRfqs?.filter((r) => r.quote_count > 0).length}
            </Badge>
          )}
        </button>
        <button
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === "carrito" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("carrito")}
        >
          <ShoppingCart className="h-4 w-4" />
          Carrito de Compras
          {cart.totalItems > 0 && (
            <Badge className="text-xs px-1.5 py-0 bg-primary">{cart.totalItems}</Badge>
          )}
        </button>
      </div>

      {/* Comparativas */}
      {tab === "comparativas" && (
        <>
          <ComparativaGrid
            rows={comparativaRfqs ?? []}
            isLoading={comparativasLoading}
            onSelect={(rfq) => setSelectedRfq(rfq)}
          />
          <ComparativaDetail
            rfq={selectedRfq}
            open={!!selectedRfq}
            onClose={() => setSelectedRfq(null)}
          />
        </>
      )}

      {/* Carrito de Compras */}
      {tab === "carrito" && (
        <>
          {cart.totalItems === 0 ? (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">El carrito de compras está vacío.</p>
                <p className="text-xs mt-1">Adjudicá productos desde las comparativas para agregarlos al carrito.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {cartByProvider.map((group) => (
                <Card key={group.provider_id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-display flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        {group.provider_name}
                      </CardTitle>
                      <Badge variant="outline">{group.items.length} producto{group.items.length !== 1 ? "s" : ""}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-hidden mb-3">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">Material</th>
                            <th className="text-right px-3 py-2 font-medium">Cantidad</th>
                            <th className="text-left px-3 py-2 font-medium">Unidad</th>
                            <th className="text-right px-3 py-2 font-medium">Precio</th>
                            <th className="text-center px-3 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr key={item.quote_item_id} className="border-t">
                              <td className="px-3 py-2">{item.description}</td>
                              <td className="text-right px-3 py-2">{item.quantity}</td>
                              <td className="px-3 py-2">{item.unit}</td>
                              <td className="text-right px-3 py-2 font-mono font-medium">
                                ${item.unit_price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cart.removeItem(item.quote_item_id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-muted/30">
                            <td colSpan={3} className="px-3 py-2 text-right font-medium">Total:</td>
                            <td className="text-right px-3 py-2 font-mono font-bold">
                              ${group.items.reduce((s, i) => s + i.unit_price, 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => generateOC.mutate(group.provider_id)}
                      disabled={generateOC.isPending}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      {generateOC.isPending ? "Generando OC..." : "Generar Orden de Compra"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
