import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useViewRole } from "@/hooks/useViewRole";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Send, ShoppingCart, Trash2, FileText, Clock, CheckCircle, History } from "lucide-react";
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
  const [provTab, setProvTab] = useState<"vigentes" | "enviadas" | "historicas">("vigentes");
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [quoteRfqId, setQuoteRfqId] = useState("");
  const [quoteDeliveryDays, setQuoteDeliveryDays] = useState("");
  const [quoteConditions, setQuoteConditions] = useState("");
  const [quoteItems, setQuoteItems] = useState<{ rfq_item_id: string; unit_price: string }[]>([]);
  const [detailRfqId, setDetailRfqId] = useState<string | null>(null);
  const [quoteDetailId, setQuoteDetailId] = useState<string | null>(null);

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

  // --- Proveedor: my submitted quotes ---
  const { data: myQuotes } = useQuery({
    queryKey: ["my-quotes", myProvider?.id],
    enabled: role === "proveedor" && !!myProvider,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, rfq_id, status, total_price, delivery_days, conditions, submitted_at, created_at, quote_items(id, rfq_item_id, unit_price, observations, rfq_items:rfq_item_id(description, quantity, unit))")
        .eq("provider_id", myProvider!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // --- Proveedor: RFQs where I quoted (for enviadas + historicas) ---
  const { data: quotedRfqs } = useQuery({
    queryKey: ["quoted-rfqs", myProvider?.id],
    enabled: role === "proveedor" && !!myProvider && !!myQuotes?.length,
    queryFn: async () => {
      const rfqIds = [...new Set(myQuotes!.map((q: any) => q.rfq_id))];
      if (!rfqIds.length) return [];
      const { data, error } = await supabase
        .from("rfqs")
        .select("id, status, created_at, pool_id, request_id, delivery_location, observations, deadline, closing_datetime, rfq_type, purchase_pools:pool_id(name), requests:request_id(request_number)")
        .in("id", rfqIds)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (data ?? []).map((r) => r.id);
      const { data: items } = await supabase.from("rfq_items").select("*").in("rfq_id", ids);
      return (data ?? []).map((r) => ({
        ...r,
        rfq_items: (items || []).filter((i) => i.rfq_id === r.id),
        myQuotes: myQuotes!.filter((q: any) => q.rfq_id === r.id),
      }));
    },
  });

  const quotedRfqIds = useMemo(() => new Set((myQuotes ?? []).map((q: any) => q.rfq_id)), [myQuotes]);

  const provVigentes = useMemo(
    () => (provRfqs ?? []).filter((r: any) => !quotedRfqIds.has(r.id)),
    [provRfqs, quotedRfqIds]
  );

  const provEnviadas = useMemo(
    () => (quotedRfqs ?? []).filter((r: any) => r.status !== "closed" && r.myQuotes.some((q: any) => ["pending", "submitted"].includes(q.status))),
    [quotedRfqs]
  );

  const provHistoricas = useMemo(
    () => (quotedRfqs ?? []).filter((r: any) => r.status === "closed" || r.myQuotes.every((q: any) => ["awarded", "rejected"].includes(q.status))),
    [quotedRfqs]
  );

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
      qc.invalidateQueries({ queryKey: ["my-quotes"] });
      qc.invalidateQueries({ queryKey: ["quoted-rfqs"] });
      setQuoteDialogOpen(false);
      setProvTab("enviadas");
      toast({ title: "Cotización enviada", description: "Podés verla en la pestaña Enviadas." });
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
    const quoteStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Enviada", variant: "default" },
      submitted: { label: "Enviada", variant: "default" },
      awarded: { label: "Adjudicada", variant: "secondary" },
      rejected: { label: "Rechazada", variant: "destructive" },
    };

    const renderRfqCard = (rfq: any, onClick: () => void) => (
      <Card key={rfq.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={onClick}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <FileText className="h-4 w-4 text-primary" />
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
    );

    const renderGroupedQuoteCard = (rfq: any) => (
      <Card key={rfq.id}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-display">
              {rfq.requests?.request_number
                ? `Pedido #${rfq.requests.request_number}`
                : rfq.purchase_pools?.name
                  ? `Pool: ${rfq.purchase_pools.name}`
                  : `SC #${rfq.id.slice(0, 8)}`}
            </CardTitle>
            {rfq.rfq_type === "closed_bid" && (
              <Badge variant="secondary" className="text-[10px]">Licitación Cerrada</Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {rfq.myQuotes.length} cotización{rfq.myQuotes.length !== 1 ? "es" : ""}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">{new Date(rfq.created_at).toLocaleDateString("es-AR")}</span>
        </CardHeader>
        <CardContent className="pb-3 space-y-2">
          <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
            {rfq.delivery_location && <span className="truncate max-w-[200px]">📍 {rfq.delivery_location}</span>}
            {rfq.deadline && <span>📅 Entrega: {new Date(rfq.deadline).toLocaleDateString("es-AR")}</span>}
            {rfq.closing_datetime && <span>⏰ Cierre: {new Date(rfq.closing_datetime).toLocaleString("es-AR")}</span>}
          </div>
          <div className="border rounded-lg overflow-hidden">
            {rfq.myQuotes.map((q: any, i: number) => (
              <button
                key={q.id}
                type="button"
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left ${i > 0 ? "border-t" : ""}`}
                onClick={() => setQuoteDetailId(q.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">#{i + 1}</span>
                  <span className="font-mono font-medium">
                    ${Number(q.total_price || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                  {q.delivery_days != null && (
                    <span className="text-xs text-muted-foreground">{q.delivery_days} días</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(q.created_at).toLocaleDateString("es-AR")}
                  </span>
                  <Badge variant={quoteStatusLabels[q.status]?.variant || "outline"} className="text-xs">
                    {quoteStatusLabels[q.status]?.label || q.status}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
          {rfq.status !== "closed" && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => openQuoteDialog(rfq)}
            >
              <Send className="h-3 w-3 mr-1" />
              Enviar nueva cotización
            </Button>
          )}
        </CardContent>
      </Card>
    );

    const renderEmptyState = (message: string, sub: string) => (
      <Card>
        <CardContent className="text-center py-12 text-muted-foreground">
          <Send className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{message}</p>
          <p className="text-xs mt-1">{sub}</p>
        </CardContent>
      </Card>
    );

    const activeProvList = provTab === "vigentes" ? provVigentes : provTab === "enviadas" ? provEnviadas : provHistoricas;

    const detailRfqData = detailRfqId
      ? provVigentes.find((r: any) => r.id === detailRfqId)
      : null;

    const quoteDetailRfq = quoteDetailId
      ? (quotedRfqs ?? []).find((r: any) => r.myQuotes.some((q: any) => q.id === quoteDetailId))
      : null;
    const quoteDetailQuote = quoteDetailRfq?.myQuotes.find((q: any) => q.id === quoteDetailId) ?? null;

    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Cotizaciones</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestión de solicitudes y cotizaciones enviadas</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {([
            { key: "vigentes" as const, label: "Vigentes", icon: Clock, count: provVigentes.length },
            { key: "enviadas" as const, label: "Enviadas", icon: Send, count: provEnviadas.length },
            { key: "historicas" as const, label: "Históricas", icon: History, count: provHistoricas.length },
          ]).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${provTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setProvTab(t.key)}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {t.count > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">{t.count}</Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeProvList.length === 0 ? (
          provTab === "vigentes"
            ? renderEmptyState("No hay solicitudes de cotización pendientes.", "Aparecerán aquí cuando haya solicitudes disponibles.")
            : provTab === "enviadas"
              ? renderEmptyState("No tenés cotizaciones pendientes de respuesta.", "Cuando envíes una cotización aparecerá aquí.")
              : renderEmptyState("No hay cotizaciones en el historial.", "Las cotizaciones resueltas aparecerán aquí.")
        ) : (
          <div className="space-y-3">
            {provTab === "vigentes" && activeProvList.map((rfq: any) =>
              renderRfqCard(rfq, () => setDetailRfqId(rfq.id))
            )}
            {provTab === "enviadas" && activeProvList.map((rfq: any) =>
              renderGroupedQuoteCard(rfq)
            )}
            {provTab === "historicas" && activeProvList.map((rfq: any) =>
              renderGroupedQuoteCard(rfq)
            )}
          </div>
        )}

        {/* RFQ detail dialog (vigentes - for quoting) */}
        <Dialog open={!!detailRfqId} onOpenChange={(o) => { if (!o) setDetailRfqId(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Detalle de la Solicitud</DialogTitle>
            </DialogHeader>
            {detailRfqData && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {detailRfqData.requests?.request_number
                      ? `Pedido #${detailRfqData.requests.request_number}`
                      : detailRfqData.purchase_pools?.name
                        ? `Pool: ${detailRfqData.purchase_pools.name}`
                        : `SC #${detailRfqData.id.slice(0, 8)}`}
                  </span>
                  <Badge variant="default">Abierto</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {detailRfqData.delivery_location && <p className="break-all"><span className="text-muted-foreground">Entrega:</span> {detailRfqData.delivery_location}</p>}
                  {detailRfqData.deadline && <p><span className="text-muted-foreground">Fecha entrega:</span> {new Date(detailRfqData.deadline).toLocaleDateString("es-AR")}</p>}
                  {detailRfqData.closing_datetime && <p><span className="text-muted-foreground">Cierre:</span> {new Date(detailRfqData.closing_datetime).toLocaleString("es-AR")}</p>}
                  <p><span className="text-muted-foreground">Creado:</span> {new Date(detailRfqData.created_at).toLocaleDateString("es-AR")}</p>
                </div>
                {detailRfqData.observations && <p className="text-sm"><span className="text-muted-foreground">Observaciones:</span> {detailRfqData.observations}</p>}
                {detailRfqData.rfq_items?.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted px-3 py-2 text-xs font-medium">Materiales solicitados</div>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-1.5">Material</th>
                          <th className="text-right px-3 py-1.5">Cantidad</th>
                          <th className="text-left px-3 py-1.5">Unidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailRfqData.rfq_items.map((item: any) => (
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
                <Button size="sm" className="w-full" onClick={() => { setDetailRfqId(null); openQuoteDialog(detailRfqData); }}>
                  <Send className="h-3 w-3 mr-1" />Enviar Cotización
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Quote detail dialog (enviadas + historicas) */}
        <Dialog open={!!quoteDetailId} onOpenChange={(o) => { if (!o) setQuoteDetailId(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Detalle de mi Cotización</DialogTitle>
            </DialogHeader>
            {quoteDetailRfq && quoteDetailQuote && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {quoteDetailRfq.requests?.request_number
                      ? `Pedido #${quoteDetailRfq.requests.request_number}`
                      : quoteDetailRfq.purchase_pools?.name
                        ? `Pool: ${quoteDetailRfq.purchase_pools.name}`
                        : `SC #${quoteDetailRfq.id.slice(0, 8)}`}
                  </span>
                  <Badge variant={quoteStatusLabels[quoteDetailQuote.status]?.variant || "outline"}>
                    {quoteStatusLabels[quoteDetailQuote.status]?.label || quoteDetailQuote.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {quoteDetailRfq.delivery_location && <p className="break-all"><span className="text-muted-foreground">Entrega:</span> {quoteDetailRfq.delivery_location}</p>}
                  {quoteDetailRfq.deadline && <p><span className="text-muted-foreground">Fecha entrega:</span> {new Date(quoteDetailRfq.deadline).toLocaleDateString("es-AR")}</p>}
                  {quoteDetailQuote.delivery_days != null && <p><span className="text-muted-foreground">Días de entrega ofrecidos:</span> {quoteDetailQuote.delivery_days}</p>}
                  {quoteDetailQuote.conditions && <p className="col-span-2"><span className="text-muted-foreground">Condiciones:</span> {quoteDetailQuote.conditions}</p>}
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-3 py-2 text-xs font-medium">Ítems cotizados</div>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-1.5">Material</th>
                        <th className="text-right px-3 py-1.5">Cant.</th>
                        <th className="text-left px-3 py-1.5">Unidad</th>
                        <th className="text-right px-3 py-1.5">Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quoteDetailQuote.quote_items || []).map((qi: any) => (
                        <tr key={qi.id} className="border-t">
                          <td className="px-3 py-1.5">{qi.rfq_items?.description || "—"}</td>
                          <td className="text-right px-3 py-1.5">{qi.rfq_items?.quantity || 0}</td>
                          <td className="px-3 py-1.5">{qi.rfq_items?.unit || "—"}</td>
                          <td className="text-right px-3 py-1.5 font-mono font-medium">
                            ${Number(qi.unit_price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={3} className="px-3 py-1.5 text-right font-medium">Total:</td>
                        <td className="text-right px-3 py-1.5 font-mono font-bold">
                          ${Number(quoteDetailQuote.total_price || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Enviada el {new Date(quoteDetailQuote.created_at).toLocaleString("es-AR")}
                </p>
              </div>
            )}
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
                const rfq = provVigentes.find((r: any) => r.id === quoteRfqId) || provRfqs?.find((r: any) => r.id === quoteRfqId) || (quotedRfqs ?? []).find((r: any) => r.id === quoteRfqId);
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
                        placeholder="Precio"
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
