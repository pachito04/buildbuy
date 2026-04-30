import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAwardCart } from "@/contexts/AwardCartContext";
import { Search, FileText, Calendar, User, Package } from "lucide-react";
import { ProductComparison } from "./ProductComparison";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHART_COLORS = [
  "hsl(24, 95%, 53%)",
  "hsl(200, 80%, 50%)",
  "hsl(142, 71%, 45%)",
  "hsl(280, 65%, 55%)",
  "hsl(38, 92%, 50%)",
  "hsl(340, 75%, 55%)",
];

interface ComparativaDetailProps {
  rfq: any;
  open: boolean;
  onClose: () => void;
}

export function ComparativaDetail({ rfq, open, onClose }: ComparativaDetailProps) {
  const [subTab, setSubTab] = useState<"productos" | "analisis">("productos");
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const cart = useAwardCart();

  const { data: rfqItems } = useQuery({
    queryKey: ["comparativa-rfq-items", rfq?.id],
    enabled: !!rfq?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfq_items")
        .select("id, description, quantity, unit")
        .eq("rfq_id", rfq.id)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: quotes } = useQuery({
    queryKey: ["comparativa-quotes", rfq?.id],
    enabled: !!rfq?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, provider_id, total_price, delivery_days, conditions, submitted_at, status, providers:provider_id(name, score), quote_items(id, rfq_item_id, unit_price, delivery_days, observations)")
        .eq("rfq_id", rfq.id)
        .in("status", ["pending", "submitted", "awarded"])
        .order("total_price", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: existingPOItemIds } = useQuery({
    queryKey: ["comparativa-po-items", rfq?.id],
    enabled: !!rfq?.id && open && !!quotes?.length,
    queryFn: async () => {
      const allQuoteItemIds = (quotes ?? []).flatMap((q: any) =>
        (q.quote_items || []).map((qi: any) => qi.id)
      );
      if (!allQuoteItemIds.length) return [] as string[];
      const { data } = await supabase
        .from("purchase_order_items")
        .select("quote_item_id")
        .in("quote_item_id", allQuoteItemIds);
      return (data ?? []).map((d: any) => d.quote_item_id as string);
    },
  });

  const handleAward = (quoteItemId: string) => {
    let foundItem: any = null;
    let foundQuote: any = null;
    let foundRfqItem: any = null;

    for (const q of (quotes ?? []) as any[]) {
      const qi = (q.quote_items || []).find((qi: any) => qi.id === quoteItemId);
      if (qi) {
        foundItem = qi;
        foundQuote = q;
        foundRfqItem = (rfqItems ?? []).find((ri: any) => ri.id === qi.rfq_item_id);
        break;
      }
    }
    if (!foundItem || !foundRfqItem) return;

    cart.addItem({
      quote_item_id: quoteItemId,
      rfq_id: rfq.id,
      rfq_item_id: foundItem.rfq_item_id,
      provider_id: foundQuote.provider_id,
      provider_name: foundQuote.providers?.name || "Proveedor",
      description: foundRfqItem.description,
      quantity: foundRfqItem.quantity,
      unit: foundRfqItem.unit,
      unit_price: Number(foundItem.unit_price) || 0,
    });
    toast({ title: "Producto adjudicado", description: "Se agregó al carrito de compras." });
  };

  const productQuotesMap = useMemo(() => {
    if (!rfqItems || !quotes) return new Map();
    const map = new Map<string, any[]>();
    for (const item of rfqItems) {
      const providerQuotes: any[] = [];
      for (const q of quotes as any[]) {
        const qi = (q.quote_items || []).find((qi: any) => qi.rfq_item_id === item.id);
        if (qi) {
          const alreadyHasPO = (existingPOItemIds ?? []).includes(qi.id);
          providerQuotes.push({
            quote_item_id: qi.id,
            provider_id: q.provider_id,
            provider_name: q.providers?.name || "Proveedor",
            unit_price: Number(qi.unit_price) || 0,
            delivery_days: qi.delivery_days ?? q.delivery_days,
            observations: qi.observations,
            total: Number(qi.unit_price) || 0,
            awarded: cart.isAwarded(qi.id) || alreadyHasPO,
          });
        }
      }
      map.set(item.id, providerQuotes);
    }
    return map;
  }, [rfqItems, quotes, existingPOItemIds, cart]);

  const filteredItems = useMemo(() => {
    if (!rfqItems) return [];
    if (!search.trim()) return rfqItems;
    const term = search.toLowerCase();
    return rfqItems.filter((i: any) => i.description.toLowerCase().includes(term));
  }, [rfqItems, search]);

  const totalPriceData = (quotes ?? []).map((q: any, i: number) => ({
    name: q.providers?.name || "Proveedor",
    total: Number(q.total_price) || 0,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const deliveryData = (quotes ?? []).map((q: any, i: number) => ({
    name: q.providers?.name || "Proveedor",
    dias: q.delivery_days || 0,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const radarData = (() => {
    if (!quotes?.length) return [];
    const maxPrice = Math.max(...(quotes as any[]).map((q: any) => Number(q.total_price) || 1));
    const maxDays = Math.max(...(quotes as any[]).map((q: any) => q.delivery_days || 1));
    return (quotes as any[]).map((q: any) => ({
      provider: q.providers?.name || "Proveedor",
      "Precio (menor=mejor)": Math.round((1 - (Number(q.total_price) || 0) / maxPrice) * 100),
      "Entrega (menor=mejor)": Math.round((1 - (q.delivery_days || 0) / maxDays) * 100),
      "Score Proveedor": Math.round((Number(q.providers?.score) || 5) * 10),
    }));
  })();

  if (!rfq) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {rfq.label}
          </DialogTitle>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Creación: {new Date(rfq.created_at).toLocaleDateString("es-AR")}
            </span>
            {rfq.closing_datetime && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Cierre: {new Date(rfq.closing_datetime).toLocaleString("es-AR")}
              </span>
            )}
            {rfq.creator_name && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {rfq.creator_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {rfqItems?.length || 0} productos
            </span>
            <Badge variant="outline">{(quotes as any[])?.length || 0} cotizaciones</Badge>
          </div>
        </DialogHeader>

        <div className="flex gap-1 border-b mt-2">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${subTab === "productos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setSubTab("productos")}
          >
            Productos
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${subTab === "analisis" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setSubTab("analisis")}
          >
            Análisis
          </button>
        </div>

        {subTab === "productos" && (
          <div className="space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar productos..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No se encontraron productos</p>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item: any) => (
                  <ProductComparison
                    key={item.id}
                    rfqItem={item}
                    providerQuotes={productQuotesMap.get(item.id) || []}
                    onAward={handleAward}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {subTab === "analisis" && (
          <div className="space-y-4 pt-2">
            {!(quotes as any[])?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No hay cotizaciones para analizar</p>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="font-display text-sm">Precio Total por Proveedor</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={totalPriceData} layout="vertical" margin={{ left: 20, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} fontSize={12} />
                          <YAxis type="category" dataKey="name" width={100} fontSize={12} />
                          <Tooltip
                            formatter={(value: number) => [`$${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, "Total"]}
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
                      <CardTitle className="font-display text-sm">Tiempo de Entrega (días)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
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

                {radarData.length >= 2 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="font-display text-sm">Comparación Multidimensional</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={320}>
                        <RadarChart data={[
                          { metric: "Precio", ...Object.fromEntries(radarData.map((r) => [r.provider, r["Precio (menor=mejor)"]])) },
                          { metric: "Entrega", ...Object.fromEntries(radarData.map((r) => [r.provider, r["Entrega (menor=mejor)"]])) },
                          { metric: "Score", ...Object.fromEntries(radarData.map((r) => [r.provider, r["Score Proveedor"]])) },
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
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
