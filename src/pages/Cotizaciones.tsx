import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useViewRole } from "@/hooks/useViewRole";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarChart3, TrendingDown, Clock, Award, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Cell,
} from "recharts";

const CHART_COLORS = [
  "hsl(24, 95%, 53%)",   // primary/orange
  "hsl(200, 80%, 50%)",  // blue
  "hsl(142, 71%, 45%)",  // green
  "hsl(280, 65%, 55%)",  // purple
  "hsl(38, 92%, 50%)",   // amber
  "hsl(340, 75%, 55%)",  // pink
];

export default function Cotizaciones() {
  const [selectedRfqId, setSelectedRfqId] = useState<string>("");
  const { viewRole: role } = useViewRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Quote submission state (proveedor)
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [quoteRfqId, setQuoteRfqId] = useState("");
  const [quoteDeliveryDays, setQuoteDeliveryDays] = useState("");
  const [quoteConditions, setQuoteConditions] = useState("");
  const [quoteItems, setQuoteItems] = useState<{ rfq_item_id: string; unit_price: string }[]>([]);

  // Get provider record for proveedor role (via provider_users join table)
  const { data: myProvider } = useQuery({
    queryKey: ["my-provider", user?.id],
    enabled: role === "proveedor" && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_users")
        .select("provider_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data ? { id: data.provider_id } : null;
    },
  });

  // Get RFQs - for providers, only show RFQs they're invited to
  const { data: rfqs } = useQuery({
    queryKey: ["rfqs-with-quotes", role, myProvider?.id],
    queryFn: async () => {
      if (role === "proveedor" && myProvider) {
        // Get RFQ IDs where this provider is invited
        const { data: invites } = await supabase.from("rfq_providers").select("rfq_id").eq("provider_id", myProvider.id);
        const rfqIds = (invites || []).map((i) => i.rfq_id);
        if (!rfqIds.length) return [];
        const { data, error } = await supabase
          .from("rfqs")
          .select("id, status, created_at, pool_id, request_id, delivery_location, notes, deadline, closing_datetime, purchase_pools:pool_id(name), rfq_items(*)")
          .in("id", rfqIds)
          .in("status", ["sent", "responded"])
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("rfqs")
        .select("id, status, created_at, pool_id, request_id, delivery_location, purchase_pools:pool_id(name)")
        .in("status", ["sent", "responded", "closed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Submit quote mutation (proveedor)
  const submitQuote = useMutation({
    mutationFn: async () => {
      if (!myProvider) throw new Error("No se encontró tu registro de proveedor");
      const totalPrice = quoteItems.reduce((sum, qi) => sum + (parseFloat(qi.unit_price) || 0), 0);
      const { data: quote, error } = await supabase
        .from("quotes")
        .insert({
          rfq_id: quoteRfqId,
          provider_id: myProvider.id,
          delivery_days: parseInt(quoteDeliveryDays) || null,
          conditions: quoteConditions || null,
          total_price: totalPrice,
        })
        .select()
        .single();
      if (error) throw error;
      const items = quoteItems.filter((qi) => parseFloat(qi.unit_price) > 0).map((qi) => ({
        quote_id: quote.id,
        rfq_item_id: qi.rfq_item_id,
        unit_price: parseFloat(qi.unit_price),
      }));
      if (items.length) {
        const { error: ie } = await supabase.from("quote_items").insert(items);
        if (ie) throw ie;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs-with-quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes-comparison"] });
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

  // Get quotes for the selected RFQ
  const { data: quotes, isLoading: quotesLoading } = useQuery({
    queryKey: ["quotes-comparison", selectedRfqId],
    enabled: !!selectedRfqId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, providers:provider_id(name, email, score), quote_items(*, rfq_items:rfq_item_id(description, quantity, unit))")
        .eq("rfq_id", selectedRfqId)
        .order("total_price", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Get RFQ items for this RFQ
  const { data: rfqItems } = useQuery({
    queryKey: ["rfq-items-comparison", selectedRfqId],
    enabled: !!selectedRfqId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfq_items")
        .select("*")
        .eq("rfq_id", selectedRfqId);
      if (error) throw error;
      return data;
    },
  });

  // Build comparison data
  const totalPriceData = (quotes || []).map((q: any, i: number) => ({
    name: q.providers?.name || "Proveedor",
    total: Number(q.total_price) || 0,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const deliveryData = (quotes || []).map((q: any, i: number) => ({
    name: q.providers?.name || "Proveedor",
    dias: q.delivery_days || 0,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  // Per-item price comparison
  const itemComparisonData = (rfqItems || []).map((item: any) => {
    const row: any = { item: item.description.length > 20 ? item.description.slice(0, 20) + "…" : item.description };
    (quotes || []).forEach((q: any) => {
      const qi = (q.quote_items || []).find((qi: any) => qi.rfq_item_id === item.id);
      row[q.providers?.name || q.id.slice(0, 6)] = qi ? Number(qi.unit_price) : 0;
    });
    return row;
  });

  const providerNames = (quotes || []).map((q: any) => q.providers?.name || q.id.slice(0, 6));

  // Radar data (normalized scores)
  const radarData = (() => {
    if (!quotes?.length) return [];
    const maxPrice = Math.max(...quotes.map((q: any) => Number(q.total_price) || 1));
    const maxDays = Math.max(...quotes.map((q: any) => q.delivery_days || 1));

    return (quotes || []).map((q: any) => ({
      provider: q.providers?.name || "Proveedor",
      "Precio (menor=mejor)": Math.round((1 - (Number(q.total_price) || 0) / maxPrice) * 100),
      "Entrega (menor=mejor)": Math.round((1 - (q.delivery_days || 0) / maxDays) * 100),
      "Score Proveedor": Math.round((Number(q.providers?.score) || 5) * 10),
    }));
  })();

  // Best quote
  const bestQuote = quotes?.[0];

  const selectedRfq = rfqs?.find((r) => r.id === selectedRfqId);

  // Provider view: list RFQs to quote
  if (role === "proveedor") {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Mis Cotizaciones</h1>
          <p className="text-muted-foreground text-sm mt-1">RFQs recibidos — envía tus cotizaciones</p>
        </div>

        {!rfqs?.length ? (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              <Send className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-sm">No tienes RFQs pendientes.</p>
              <p className="text-xs mt-1">Aparecerán aquí cuando te inviten a cotizar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rfqs.map((rfq: any) => (
              <Card key={rfq.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-sm font-display">RFQ #{rfq.id.slice(0, 8)}</CardTitle>
                    <Badge variant={rfq.status === "sent" ? "default" : "outline"}>
                      {rfq.status === "sent" ? "Abierto" : "Respondido"}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(rfq.created_at).toLocaleDateString("es-MX")}</span>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                    {rfq.delivery_location && <span>📍 {rfq.delivery_location}</span>}
                    {rfq.deadline && <span>📅 Entrega: {new Date(rfq.deadline).toLocaleDateString("es-MX")}</span>}
                    {rfq.closing_datetime && <span>⏰ Cierre: {new Date(rfq.closing_datetime).toLocaleString("es-MX")}</span>}
                  </div>
                  {rfq.notes && <p className="text-sm text-muted-foreground">{rfq.notes}</p>}
                  {rfq.rfq_items?.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left px-3 py-2">Material</th>
                            <th className="text-right px-3 py-2">Cantidad</th>
                            <th className="text-left px-3 py-2">Unidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rfq.rfq_items.map((item: any) => (
                            <tr key={item.id} className="border-t">
                              <td className="px-3 py-2">{item.description}</td>
                              <td className="text-right px-3 py-2">{item.quantity}</td>
                              <td className="px-3 py-2">{item.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <Button size="sm" onClick={() => openQuoteDialog(rfq)}>
                    <Send className="h-3 w-3 mr-1" />Enviar Cotización
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Quote submission dialog */}
        <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Enviar Cotización</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); submitQuote.mutate(); }} className="space-y-4">
              {quoteItems.map((qi, i) => {
                const rfq = rfqs?.find((r) => r.id === quoteRfqId);
                const rfqItem = (rfq as any)?.rfq_items?.find((it: any) => it.id === qi.rfq_item_id);
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
                  <Input disabled value={`$${quoteItems.reduce((s, qi) => s + (parseFloat(qi.unit_price) || 0), 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`} />
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

  // Compras / Admin view: comparison charts
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Comparación de Cotizaciones</h1>
          <p className="text-muted-foreground text-sm mt-1">Análisis visual de ofertas por RFQ</p>
        </div>
      </div>

      {/* RFQ Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <Select value={selectedRfqId} onValueChange={setSelectedRfqId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un RFQ para comparar cotizaciones..." />
                </SelectTrigger>
                <SelectContent>
                  {rfqs?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      RFQ #{r.id.slice(0, 8)}
                      {(r as any).purchase_pools?.name ? ` — Pool: ${(r as any).purchase_pools.name}` : ""}
                      {" — "}
                      {new Date(r.created_at).toLocaleDateString("es-MX")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedRfqId && (
        <Card>
          <CardContent className="text-center py-16 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-sm font-medium">Selecciona un RFQ para ver la comparación</p>
            <p className="text-xs mt-1">Las gráficas se generarán automáticamente con las cotizaciones recibidas.</p>
          </CardContent>
        </Card>
      )}

      {selectedRfqId && quotesLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {selectedRfqId && !quotesLoading && !quotes?.length && (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No hay cotizaciones recibidas para este RFQ.</p>
            <p className="text-xs mt-1">Las cotizaciones aparecerán aquí cuando los proveedores respondan.</p>
          </CardContent>
        </Card>
      )}

      {selectedRfqId && quotes && quotes.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <Award className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Mejor precio</p>
                    <p className="text-lg font-bold font-display">${Number(bestQuote?.total_price || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-primary font-medium">{(bestQuote as any)?.providers?.name}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <TrendingDown className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Cotizaciones</p>
                    <p className="text-lg font-bold font-display">{quotes.length}</p>
                    <p className="text-xs text-muted-foreground">proveedores</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Entrega más rápida</p>
                    <p className="text-lg font-bold font-display">
                      {Math.min(...quotes.map((q: any) => q.delivery_days || 999))} días
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <TrendingDown className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Diferencia max-min</p>
                    <p className="text-lg font-bold font-display">
                      ${(Math.max(...quotes.map((q: any) => Number(q.total_price) || 0)) - Math.min(...quotes.map((q: any) => Number(q.total_price) || 0))).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Precio Total por Proveedor</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={totalPriceData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} fontSize={12} />
                    <YAxis type="category" dataKey="name" width={100} fontSize={12} />
                    <Tooltip
                      formatter={(value: number) => [`$${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, "Total"]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={32}>
                      {totalPriceData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Tiempo de Entrega (días)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={deliveryData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={12} />
                    <YAxis type="category" dataKey="name" width={100} fontSize={12} />
                    <Tooltip
                      formatter={(value: number) => [`${value} días`, "Entrega"]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Bar dataKey="dias" radius={[0, 6, 6, 0]} barSize={32}>
                      {deliveryData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Per-item comparison */}
          {itemComparisonData.length > 0 && providerNames.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Precio Unitario por Material</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, itemComparisonData.length * 50)}>
                  <BarChart data={itemComparisonData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tickFormatter={(v) => `$${v.toLocaleString()}`} fontSize={12} />
                    <YAxis type="category" dataKey="item" width={140} fontSize={11} />
                    <Tooltip
                      formatter={(value: number) => [`$${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, ""]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Legend />
                    {providerNames.map((name, i) => (
                      <Bar key={name} dataKey={name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[0, 4, 4, 0]} barSize={14} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Radar chart */}
          {radarData.length >= 2 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Comparación Multidimensional</CardTitle>
                <p className="text-xs text-muted-foreground">Mayor área = mejor evaluación general</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <RadarChart data={[
                    { metric: "Precio (menor=mejor)", ...Object.fromEntries(radarData.map((r) => [r.provider, r["Precio (menor=mejor)"]])) },
                    { metric: "Entrega (menor=mejor)", ...Object.fromEntries(radarData.map((r) => [r.provider, r["Entrega (menor=mejor)"]])) },
                    { metric: "Score Proveedor", ...Object.fromEntries(radarData.map((r) => [r.provider, r["Score Proveedor"]])) },
                  ]}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="metric" fontSize={11} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} fontSize={10} />
                    {radarData.map((r, i) => (
                      <Radar
                        key={r.provider}
                        name={r.provider}
                        dataKey={r.provider}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Detail table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">Detalle de Cotizaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                      <th className="text-right px-3 py-2 font-medium">Entrega</th>
                      <th className="text-right px-3 py-2 font-medium">Score</th>
                      <th className="text-left px-3 py-2 font-medium">Condiciones</th>
                      <th className="text-left px-3 py-2 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q: any, i: number) => (
                      <tr key={q.id} className={`border-b ${i === 0 ? "bg-primary/5" : ""}`}>
                        <td className="px-3 py-2 font-medium flex items-center gap-2">
                          {i === 0 && <Badge className="text-[10px] py-0">Mejor</Badge>}
                          {q.providers?.name || "—"}
                        </td>
                        <td className="text-right px-3 py-2 font-mono font-semibold">
                          ${Number(q.total_price || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-right px-3 py-2">{q.delivery_days ?? "—"} días</td>
                        <td className="text-right px-3 py-2">{q.providers?.score ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{q.conditions || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {q.submitted_at ? new Date(q.submitted_at).toLocaleDateString("es-MX") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
