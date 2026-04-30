import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Send, ShoppingCart, CheckCircle, Layers } from "lucide-react";
import { useBasket } from "@/contexts/BasketContext";
import { RfqNuevo } from "@/components/rfqs/RfqNuevo";
import { RfqCesta } from "@/components/rfqs/RfqCesta";
import { RfqList } from "@/components/rfqs/RfqList";

type RfqTab = "nuevo" | "cesta" | "pool" | "vigentes" | "historico";

const rfqStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "secondary" },
  sent: { label: "Enviado", variant: "default" },
  responded: { label: "Respondido", variant: "outline" },
  closed: { label: "Cerrado", variant: "destructive" },
};

export default function RFQs() {
  const [activeTab, setActiveTab] = useState<RfqTab>("vigentes");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [awardQuoteId, setAwardQuoteId] = useState<string | null>(null);
  const [awardNotes, setAwardNotes] = useState("");
  const [awardPaymentTerms, setAwardPaymentTerms] = useState("");

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
        .select("*, rfq_items(*), rfq_providers(*, providers:provider_id(name, email)), purchase_pools:pool_id(name), requests:request_id(raw_message, request_number)")
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

  const { data: closedPools } = useQuery({
    queryKey: ["closed-pools"],
    enabled: activeTab === "pool",
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

  const sendRfq = useMutation({
    mutationFn: async (rfqId: string) => {
      const { error } = await supabase.from("rfqs").update({ status: "sent" as any }).eq("id", rfqId);
      if (error) throw error;
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
      toast({ title: "Solicitud enviada a proveedores" });
    },
  });

  // Detail & Award logic
  const detailRfq = rfqs?.find((r) => r.id === detailId);

  const { data: detailQuotes } = useQuery({
    queryKey: ["rfq-detail-quotes", detailId],
    enabled: !!detailId && detailRfq?.status !== "draft",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, providers:provider_id(name, email, score), quote_items(*, rfq_items:rfq_item_id(description, quantity, unit))")
        .eq("rfq_id", detailId!)
        .order("total_price", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const awardFromRfq = useMutation({
    mutationFn: async (quoteId: string) => {
      const quote = detailQuotes?.find((q: any) => q.id === quoteId);
      if (!quote || !companyId || !detailId) throw new Error("Datos incompletos");

      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId,
          provider_id: (quote as any).provider_id,
          rfq_id: detailId,
          request_id: (detailRfq as any)?.request_id || null,
          total_amount: Number((quote as any).total_price) || 0,
          payment_terms: awardPaymentTerms || (quote as any).conditions || null,
          notes: awardNotes || null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (poErr) throw poErr;

      const items = ((quote as any).quote_items || []).map((qi: any) => ({
        purchase_order_id: po.id,
        description: qi.rfq_items?.description || "Ítem",
        quantity: Number(qi.rfq_items?.quantity) || 0,
        unit: qi.rfq_items?.unit || "pza",
        unit_price: Number(qi.unit_price) || 0,
        quote_item_id: qi.id,
        request_item_id: qi.rfq_items?.request_item_id || null,
      }));
      if (items.length) {
        const { error: itemsErr } = await supabase.from("purchase_order_items").insert(items);
        if (itemsErr) throw itemsErr;
      }

      await supabase.from("rfqs").update({ status: "closed" as any }).eq("id", detailId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["rfq-detail-quotes"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setAwardQuoteId(null);
      setAwardNotes("");
      setAwardPaymentTerms("");
      setDetailId(null);
      toast({ title: "Orden de compra generada", description: "La solicitud ha sido cerrada y la OC enviada al proveedor." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Filtered lists
  const vigentes = rfqs?.filter((r) => ["draft", "sent", "responded"].includes(r.status)) ?? [];
  const historico = rfqs?.filter((r) => r.status === "closed") ?? [];

  const tabs: { key: RfqTab; label: string; icon?: typeof FileText; badge?: number }[] = [
    { key: "nuevo", label: "Nuevo", icon: Plus },
    { key: "cesta", label: "Cesta", icon: ShoppingCart, badge: basket.totalItems || undefined },
    { key: "pool", label: "Consolidar Pool", icon: Layers },
    { key: "vigentes", label: "Vigentes", badge: vigentes.length || undefined },
    { key: "historico", label: "Histórico", badge: historico.length || undefined },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Solicitudes de Cotización</h1>
        <p className="text-muted-foreground text-sm mt-1">Gestión de solicitudes enviadas a proveedores</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap border-b pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
            >
              {Icon && <Icon className="h-3.5 w-3.5 mr-1.5" />}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                  {tab.badge}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "nuevo" && (
        <RfqNuevo companyId={companyId ?? null} providers={providers ?? []} />
      )}

      {activeTab === "cesta" && (
        <RfqCesta companyId={companyId ?? null} providers={providers ?? []} />
      )}

      {activeTab === "pool" && (
        <div className="space-y-3">
          {!closedPools?.length ? (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                <Layers className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No hay pools cerrados para consolidar.</p>
                <p className="text-xs mt-1">Cerrá un pool desde el módulo de Pools de Compra para generar una solicitud consolidada.</p>
              </CardContent>
            </Card>
          ) : (
            closedPools.map((pool) => {
              const allItems = ((pool as any).pool_requests || []).flatMap((pr: any) => pr.requests?.request_items || []);
              const hasRfq = rfqs?.some((r) => (r as any).pool_id === pool.id);
              return (
                <Card key={pool.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">{pool.name}</span>
                        <Badge variant="outline" className="text-xs">{allItems.length} ítems</Badge>
                      </div>
                      {hasRfq ? (
                        <Badge variant="secondary" className="text-xs">Solicitud generada</Badge>
                      ) : (
                        <Button size="sm" onClick={() => { /* TODO: create from pool */ toast({ title: "Próximamente", description: "La creación desde pool se habilitará pronto." }); }}>
                          <Send className="h-3 w-3 mr-1" />Generar solicitud
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {activeTab === "vigentes" && (
        <RfqList
          rfqs={vigentes}
          isLoading={isLoading}
          emptyMessage="No hay solicitudes vigentes."
          emptySubMessage="Creá una desde la pestaña Nuevo o desde la Cesta."
          onDetail={setDetailId}
          onSend={(id) => sendRfq.mutate(id)}
        />
      )}

      {activeTab === "historico" && (
        <RfqList
          rfqs={historico}
          isLoading={isLoading}
          emptyMessage="No hay solicitudes en el histórico."
          emptySubMessage="Las solicitudes cerradas aparecerán acá."
          onDetail={setDetailId}
        />
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Detalle de la Solicitud</DialogTitle>
          </DialogHeader>
          {detailRfq && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {(detailRfq as any).requests?.request_number
                    ? `Pedido #${(detailRfq as any).requests.request_number}`
                    : (detailRfq as any).purchase_pools?.name
                      ? `Pool: ${(detailRfq as any).purchase_pools.name}`
                      : `SC #${detailRfq.id.slice(0, 8)}`}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={rfqStatusLabels[detailRfq.status]?.variant || "secondary"}>
                    {rfqStatusLabels[detailRfq.status]?.label || detailRfq.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {(detailRfq as any).rfq_type === "closed_bid" ? "Licitación Cerrada" : "Pedido Abierto"}
                  </Badge>
                </div>
              </div>

              {(detailRfq as any).closing_datetime && (
                <p className="text-sm"><span className="text-muted-foreground">Cierre cotización:</span> {new Date((detailRfq as any).closing_datetime).toLocaleString("es-AR")}</p>
              )}
              {detailRfq.deadline && (
                <p className="text-sm"><span className="text-muted-foreground">Entrega límite:</span> {new Date(detailRfq.deadline).toLocaleDateString("es-AR")}</p>
              )}
              {(detailRfq as any).delivery_location && (
                <p className="text-sm break-all"><span className="text-muted-foreground">Lugar de entrega:</span> {(detailRfq as any).delivery_location}</p>
              )}
              {(detailRfq as any).observations && (
                <p className="text-sm"><span className="text-muted-foreground">Observaciones:</span> {(detailRfq as any).observations}</p>
              )}

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
                  <Send className="h-4 w-4 mr-2" />Enviar a Proveedores
                </Button>
              )}

              {detailRfq.status !== "draft" && detailQuotes && detailQuotes.length > 0 && (
                <div className="border-t pt-3 space-y-3">
                  <p className="text-sm font-medium">Cotizaciones Recibidas ({detailQuotes.length})</p>
                  {detailQuotes.map((q: any, i: number) => (
                    <div key={q.id} className={`border rounded-lg p-3 space-y-2 ${i === 0 ? "border-primary/50 bg-primary/5" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {i === 0 && <Badge className="text-[10px] py-0">Mejor</Badge>}
                          <span className="text-sm font-medium">{q.providers?.name || "Proveedor"}</span>
                        </div>
                        <span className="text-sm font-mono font-bold">${Number(q.total_price || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Entrega: {q.delivery_days ?? "—"} días</span>
                        <span>Score: {q.providers?.score ?? "—"}</span>
                      </div>
                      {detailRfq.status !== "closed" && (
                        <Button
                          size="sm"
                          variant={i === 0 ? "default" : "outline"}
                          className="w-full mt-1"
                          onClick={() => setAwardQuoteId(q.id)}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />Adjudicar
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {detailRfq.status !== "draft" && detailQuotes?.length === 0 && (
                <p className="text-xs text-muted-foreground text-center border-t pt-3">Aún no se recibieron cotizaciones.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Award quote dialog */}
      <Dialog open={!!awardQuoteId} onOpenChange={(o) => { if (!o) { setAwardQuoteId(null); setAwardNotes(""); setAwardPaymentTerms(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Adjudicar Cotización</DialogTitle>
          </DialogHeader>
          {(() => {
            const q = detailQuotes?.find((q: any) => q.id === awardQuoteId);
            if (!q) return null;
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{(q as any).providers?.name || "Proveedor"}</span>
                  <span className="text-sm font-mono font-bold">${Number((q as any).total_price || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <p><span className="text-muted-foreground">Entrega:</span> {(q as any).delivery_days ?? "—"} días</p>
                  <p><span className="text-muted-foreground">Score:</span> {(q as any).providers?.score ?? "—"}</p>
                  {(q as any).conditions && (
                    <p className="col-span-2"><span className="text-muted-foreground">Condiciones:</span> {(q as any).conditions}</p>
                  )}
                </div>
                {(q as any).quote_items?.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted px-3 py-2 text-xs font-medium">Detalle de Ítems</div>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-1.5">Material</th>
                          <th className="text-right px-3 py-1.5">Cant.</th>
                          <th className="text-right px-3 py-1.5">P. Unit.</th>
                          <th className="text-right px-3 py-1.5">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(q as any).quote_items.map((qi: any) => (
                          <tr key={qi.id} className="border-t">
                            <td className="px-3 py-1.5">{qi.rfq_items?.description || "—"}</td>
                            <td className="text-right px-3 py-1.5">{qi.rfq_items?.quantity || 0}</td>
                            <td className="text-right px-3 py-1.5 font-mono">${Number(qi.unit_price || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                            <td className="text-right px-3 py-1.5 font-mono font-medium">
                              ${(Number(qi.unit_price || 0) * Number(qi.rfq_items?.quantity || 0)).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="space-y-3 border-t pt-3">
                  <div className="space-y-2">
                    <Label>Condiciones de pago (OC)</Label>
                    <Input placeholder="Ej: 30 días neto" value={awardPaymentTerms} onChange={(e) => setAwardPaymentTerms(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notas adicionales</Label>
                    <Textarea placeholder="Observaciones para la orden de compra..." value={awardNotes} onChange={(e) => setAwardNotes(e.target.value)} />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => awardFromRfq.mutate(awardQuoteId!)}
                  disabled={awardFromRfq.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {awardFromRfq.isPending ? "Generando OC..." : "Adjudicar y Generar Orden de Compra"}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
