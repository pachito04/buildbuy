import { useState, useMemo } from "react";
import { lineSubtotal } from "@/lib/quote-pricing";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAwardCart } from "@/contexts/AwardCartContext";
import { useToast } from "@/hooks/use-toast";
import { useViewRole } from "@/hooks/useViewRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EditarEncabezadoDialog } from "@/components/comparativa/EditarEncabezadoDialog";
import { HistorialModificaciones } from "@/components/comparativa/HistorialModificaciones";
import { isoToDatetimeLocal } from "@/lib/rfq-header-utils";
import {
  ArrowLeft,
  Search,
  Package,
  Calendar,
  User,
  ShoppingCart,
  ArrowDown,
  ArrowUp,
  FileText,
  X,
  Pencil,
} from "lucide-react";

export default function Comparativa() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const navigate = useNavigate();
  const cart = useAwardCart();
  const { toast } = useToast();
  const { viewRole } = useViewRole();
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editOpen, setEditOpen] = useState(false);

  const canEdit = viewRole === "compras" || viewRole === "admin";

  const { data: rfq } = useQuery({
    queryKey: ["comparativa-rfq", rfqId],
    enabled: !!rfqId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select(
          "id, status, created_at, closing_datetime, observations, created_by, request_id, pool_id, descripcion, price_terms, payment_terms, requests:request_id(request_number), purchase_pools:pool_id(name)"
        )
        .eq("id", rfqId!)
        .single();
      if (error) throw error;

      let creator_name: string | null = null;
      if (data.created_by) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data.created_by)
          .single();
        creator_name = profile?.full_name ?? null;
      }
      return { ...data, creator_name };
    },
  });

  const { data: rfqItems } = useQuery({
    queryKey: ["comparativa-rfq-items", rfqId],
    enabled: !!rfqId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfq_items")
        .select("id, description, quantity, unit")
        .eq("rfq_id", rfqId!)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: quotes } = useQuery({
    queryKey: ["comparativa-quotes", rfqId],
    enabled: !!rfqId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(
          "id, provider_id, total_price, delivery_days, conditions, observations, submitted_at, status, providers:provider_id(name, score), quote_items(id, rfq_item_id, unit_price, delivery_days, observations)"
        )
        .eq("rfq_id", rfqId!)
        .in("status", ["pending", "submitted", "awarded"])
        .order("total_price", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: existingPOItems } = useQuery({
    queryKey: ["comparativa-po-items", rfqId],
    enabled: !!rfqId && !!quotes?.length,
    queryFn: async () => {
      const allQuoteItemIds = (quotes ?? []).flatMap((q: any) =>
        (q.quote_items || []).map((qi: any) => qi.id)
      );
      if (!allQuoteItemIds.length) return [];
      const { data } = await supabase
        .from("purchase_order_items")
        .select("quote_item_id, quantity")
        .in("quote_item_id", allQuoteItemIds);
      return data ?? [];
    },
  });

  const poItemMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const poi of existingPOItems ?? []) {
      map.set(poi.quote_item_id, poi.quantity);
    }
    return map;
  }, [existingPOItems]);

  const productQuotesMap = useMemo(() => {
    if (!rfqItems || !quotes) return new Map<string, any[]>();
    const map = new Map<string, any[]>();
    for (const item of rfqItems) {
      const providerQuotes: any[] = [];
      for (const q of quotes as any[]) {
        const qi = (q.quote_items || []).find(
          (qi: any) => qi.rfq_item_id === item.id
        );
        if (qi) {
          const hasPO = poItemMap.has(qi.id);
          providerQuotes.push({
            quote_item_id: qi.id,
            rfq_item_id: item.id,
            provider_id: q.provider_id,
            provider_name: q.providers?.name || "Proveedor",
            unit_price: Number(qi.unit_price) || 0,
            delivery_days: qi.delivery_days ?? q.delivery_days,
            observations: qi.observations,
            general_observations: q.observations ?? null,
            inCart: cart.isAwarded(qi.id),
            hasPO,
          });
        }
      }
      providerQuotes.sort((a, b) => a.unit_price - b.unit_price);
      map.set(item.id, providerQuotes);
    }
    return map;
  }, [rfqItems, quotes, poItemMap, cart]);

  const awardedByRfqItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart.items) {
      if (item.rfq_id === rfqId) {
        map.set(item.rfq_item_id, (map.get(item.rfq_item_id) || 0) + item.quantity);
      }
    }
    for (const [quoteItemId, poQty] of poItemMap) {
      for (const q of (quotes ?? []) as any[]) {
        const qi = (q.quote_items || []).find((qi: any) => qi.id === quoteItemId);
        if (qi) {
          map.set(qi.rfq_item_id, (map.get(qi.rfq_item_id) || 0) + poQty);
        }
      }
    }
    return map;
  }, [cart.items, rfqId, poItemMap, quotes]);

  const filteredItems = useMemo(() => {
    if (!rfqItems) return [];
    if (!search.trim()) return rfqItems;
    const term = search.toLowerCase();
    return rfqItems.filter((i: any) =>
      i.description.toLowerCase().includes(term)
    );
  }, [rfqItems, search]);

  const getQuantity = (quoteItemId: string, defaultQty: number) =>
    quantities[quoteItemId] ?? defaultQty;

  const handleAward = (quoteItemId: string) => {
    let foundQi: any = null;
    let foundQuote: any = null;
    let foundRfqItem: any = null;

    for (const q of (quotes ?? []) as any[]) {
      const qi = (q.quote_items || []).find((qi: any) => qi.id === quoteItemId);
      if (qi) {
        foundQi = qi;
        foundQuote = q;
        foundRfqItem = (rfqItems ?? []).find(
          (ri: any) => ri.id === qi.rfq_item_id
        );
        break;
      }
    }
    if (!foundQi || !foundRfqItem) return;

    const qty = getQuantity(quoteItemId, foundRfqItem.quantity);
    if (qty <= 0) {
      toast({
        title: "Cantidad inválida",
        description: "La cantidad debe ser mayor a 0.",
        variant: "destructive",
      });
      return;
    }

    const alreadyAwarded = awardedByRfqItem.get(foundRfqItem.id) || 0;
    const currentCartQty =
      cart.items.find((i) => i.quote_item_id === quoteItemId)?.quantity ?? 0;
    const otherAwarded = alreadyAwarded - currentCartQty;

    if (otherAwarded + qty > foundRfqItem.quantity) {
      toast({
        title: "Cantidad excedida",
        description: `Solo quedan ${(foundRfqItem.quantity - otherAwarded).toLocaleString("es-AR")} ${foundRfqItem.unit} disponibles para adjudicar.`,
        variant: "destructive",
      });
      return;
    }

    cart.addItem({
      quote_item_id: quoteItemId,
      rfq_id: rfqId!,
      rfq_item_id: foundQi.rfq_item_id,
      provider_id: foundQuote.provider_id,
      provider_name: foundQuote.providers?.name || "Proveedor",
      description: foundRfqItem.description,
      quantity: qty,
      unit: foundRfqItem.unit,
      unit_price: Number(foundQi.unit_price) || 0,
    });
    toast({
      title: "Producto adjudicado",
      description: `${qty.toLocaleString("es-AR")} ${foundRfqItem.unit} de "${foundRfqItem.description}" agregados al carrito.`,
    });
  };

  const rfqLabel = rfq
    ? (rfq as any).requests?.request_number
      ? `Pedido #${(rfq as any).requests.request_number}`
      : (rfq as any).purchase_pools?.name
        ? `Pool: ${(rfq as any).purchase_pools.name}`
        : `SC #${rfq.id.slice(0, 8)}`
    : "";

  const COL_COUNT = 8;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/cotizaciones")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary shrink-0" />
              <span className="truncate">Comparativa — {rfqLabel}</span>
            </h1>
            {rfq && (
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Creación:{" "}
                  {new Date(rfq.created_at).toLocaleDateString("es-AR")}
                </span>
                {rfq.closing_datetime && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Cierre:{" "}
                    {new Date(rfq.closing_datetime).toLocaleString("es-AR")}
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
                <Badge variant="outline">
                  {(quotes as any[])?.length || 0} cotizaciones
                </Badge>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canEdit && rfqId && (
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar encabezado
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate("/cotizaciones")}
            className="flex items-center gap-2"
          >
            <ShoppingCart className="h-4 w-4" />
            Carrito
            {cart.totalItems > 0 && (
              <Badge className="text-xs px-1.5 py-0 bg-primary">
                {cart.totalItems}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Historial de modificaciones — visible below header when rfq is loaded */}
      {rfqId && (
        <div className="-mt-2">
          <HistorialModificaciones rfqId={rfqId} />
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar productos..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Comparison table */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No se encontraron productos</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted/80 backdrop-blur-sm">
                <th className="text-left px-4 py-3 font-medium">Proveedor</th>
                <th className="text-right px-4 py-3 font-medium">
                  Precio Unit.
                </th>
                <th className="text-center px-4 py-3 font-medium">vs Mejor</th>
                <th className="text-center px-4 py-3 font-medium">Entrega</th>
                <th className="text-right px-4 py-3 font-medium">
                  Importe Total
                </th>
                <th className="text-left px-4 py-3 font-medium">
                  Observaciones
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  Cant. a comprar
                </th>
                <th className="text-center px-4 py-3 font-medium w-32">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any) => {
                const providerQuotes = productQuotesMap.get(item.id) || [];
                const bestPrice = providerQuotes[0]?.unit_price ?? 0;
                const totalAwarded = awardedByRfqItem.get(item.id) || 0;
                const remaining = item.quantity - totalAwarded;

                return (
                  <ProductSection
                    key={item.id}
                    item={item}
                    providerQuotes={providerQuotes}
                    bestPrice={bestPrice}
                    totalAwarded={totalAwarded}
                    remaining={remaining}
                    colCount={COL_COUNT}
                    quantities={quantities}
                    setQuantities={setQuantities}
                    getQuantity={getQuantity}
                    onAward={handleAward}
                    onRemove={cart.removeItem}
                    cartItems={cart.items}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit header dialog — only mounted for compras/admin */}
      {canEdit && rfqId && rfq && (
        <EditarEncabezadoDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          rfqId={rfqId}
          current={{
            // Normalize the stored TIMESTAMPTZ to the datetime-local shape so the
            // input renders it and an untouched save produces no spurious diff.
            closing_datetime: isoToDatetimeLocal((rfq as any).closing_datetime),
            descripcion: (rfq as any).descripcion ?? "",
            price_terms: (rfq as any).price_terms ?? "",
            payment_terms: (rfq as any).payment_terms ?? "",
          }}
        />
      )}
    </div>
  );
}

interface ProductSectionProps {
  item: any;
  providerQuotes: any[];
  bestPrice: number;
  totalAwarded: number;
  remaining: number;
  colCount: number;
  quantities: Record<string, number>;
  setQuantities: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  getQuantity: (quoteItemId: string, defaultQty: number) => number;
  onAward: (quoteItemId: string) => void;
  onRemove: (quoteItemId: string) => void;
  cartItems: any[];
}

function ProductSection({
  item,
  providerQuotes,
  bestPrice,
  totalAwarded,
  remaining,
  colCount,
  quantities,
  setQuantities,
  getQuantity,
  onAward,
  onRemove,
  cartItems,
}: ProductSectionProps) {
  return (
    <>
      {/* Product header band */}
      <tr className="bg-primary/10 border-t-2 border-primary/20">
        <td colSpan={colCount} className="px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-4 w-4 text-primary" />
              <span className="font-semibold">{item.description}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                Solicitado:{" "}
                <span className="font-semibold text-foreground">
                  {item.quantity.toLocaleString("es-AR")}
                </span>{" "}
                {item.unit}
              </span>
              {totalAwarded > 0 && (
                <Badge
                  variant={remaining === 0 ? "default" : "outline"}
                  className={`text-xs ${remaining === 0 ? "bg-green-600" : ""}`}
                >
                  Adjudicado: {totalAwarded.toLocaleString("es-AR")} | Restante:{" "}
                  {remaining.toLocaleString("es-AR")}
                </Badge>
              )}
              <Badge variant="outline">
                {providerQuotes.length} cotización
                {providerQuotes.length !== 1 ? "es" : ""}
              </Badge>
            </div>
          </div>
        </td>
      </tr>

      {/* Provider rows */}
      {providerQuotes.length === 0 ? (
        <tr>
          <td
            colSpan={colCount}
            className="px-4 py-3 text-center text-muted-foreground bg-muted/20"
          >
            Sin cotizaciones para este producto
          </td>
        </tr>
      ) : (
        providerQuotes.map((q: any, i: number) => {
          const diff =
            bestPrice > 0
              ? ((q.unit_price - bestPrice) / bestPrice) * 100
              : 0;
          const isBest = i === 0 && providerQuotes.length > 1;
          const cartItem = cartItems.find(
            (ci) => ci.quote_item_id === q.quote_item_id
          );
          const qty = q.inCart
            ? cartItem?.quantity ?? 0
            : getQuantity(q.quote_item_id, item.quantity);
          const total = lineSubtotal(q.unit_price, qty);

          return (
            <tr
              key={q.quote_item_id}
              className={`border-b last:border-b-0 transition-colors ${
                isBest ? "bg-green-50 dark:bg-green-950/20" : ""
              } ${q.inCart ? "bg-blue-50 dark:bg-blue-950/20" : ""} ${
                q.hasPO ? "bg-muted/30" : ""
              }`}
            >
              <td className="px-4 py-2.5 font-medium">
                <div className="flex items-center gap-2">
                  {isBest && (
                    <Badge className="text-[10px] py-0 bg-green-600 shrink-0">
                      Mejor
                    </Badge>
                  )}
                  {q.provider_name}
                </div>
              </td>
              <td className="text-right px-4 py-2.5 font-mono font-semibold">
                $
                {q.unit_price.toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                })}
              </td>
              <td className="text-center px-4 py-2.5">
                {providerQuotes.length === 1 ? (
                  <span className="text-xs text-muted-foreground">Única</span>
                ) : isBest ? (
                  <span className="inline-flex items-center gap-1 text-green-600 font-medium text-xs">
                    <ArrowDown className="h-3 w-3" /> Mejor
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-500 font-medium text-xs">
                    <ArrowUp className="h-3 w-3" /> +{diff.toFixed(1)}%
                  </span>
                )}
              </td>
              <td className="text-center px-4 py-2.5">
                {q.delivery_days != null ? `${q.delivery_days} días` : "—"}
              </td>
              <td className="text-right px-4 py-2.5 font-mono">
                $
                {total.toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                })}
              </td>
              <td className="px-4 py-2.5 max-w-[220px]">
                {q.observations ? (
                  <p className="text-xs text-muted-foreground truncate" title={q.observations}>
                    {q.observations}
                  </p>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                {q.general_observations && (
                  <p
                    className="text-xs text-muted-foreground/70 italic truncate mt-0.5 border-t border-muted pt-0.5"
                    title={`Obs. general: ${q.general_observations}`}
                  >
                    {q.general_observations}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5 text-right">
                {q.hasPO ? (
                  <span className="font-mono font-medium text-muted-foreground">
                    {(cartItem?.quantity ?? 0).toLocaleString("es-AR")}
                  </span>
                ) : q.inCart ? (
                  <span className="font-mono font-medium">
                    {(cartItem?.quantity ?? 0).toLocaleString("es-AR")}
                  </span>
                ) : (
                  <Input
                    type="number"
                    className="w-28 h-8 text-right font-mono ml-auto"
                    value={getQuantity(q.quote_item_id, item.quantity)}
                    min={0}
                    max={item.quantity}
                    onChange={(e) => {
                      const val = Math.max(
                        0,
                        parseInt(e.target.value) || 0
                      );
                      setQuantities((prev) => ({
                        ...prev,
                        [q.quote_item_id]: val,
                      }));
                    }}
                  />
                )}
              </td>
              <td className="px-4 py-2.5 text-center">
                {q.hasPO ? (
                  <Badge
                    variant="outline"
                    className="text-xs text-muted-foreground"
                  >
                    OC Generada
                  </Badge>
                ) : q.inCart ? (
                  <div className="flex items-center justify-center gap-1">
                    <Badge className="bg-blue-600 text-white text-xs">
                      En carrito
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onRemove(q.quote_item_id)}
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onAward(q.quote_item_id)}
                  >
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    Adjudicar
                  </Button>
                )}
              </td>
            </tr>
          );
        })
      )}
    </>
  );
}
