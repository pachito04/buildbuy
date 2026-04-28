import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  ArrowRight,
  Inbox,
  Layers,
  FileText,
  BarChart3,
  ShoppingCart,
  ChevronRight,
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "secondary" },
  approved: { label: "Aprobado", variant: "default" },
  in_pool: { label: "En Pool", variant: "outline" },
  rfq_direct: { label: "Solicitud Directa", variant: "outline" },
  rejected: { label: "Rechazado", variant: "destructive" },
  open: { label: "Abierto", variant: "default" },
  closed: { label: "Cerrado", variant: "secondary" },
  quoting: { label: "Cotizando", variant: "outline" },
  awarded: { label: "Adjudicado", variant: "default" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  sent: { label: "Enviado", variant: "default" },
  responded: { label: "Respondido", variant: "outline" },
  accepted: { label: "Aceptada", variant: "default" },
};

function getStatus(status: string) {
  return STATUS_MAP[status] || { label: status, variant: "secondary" as const };
}

interface TraceChain {
  request: any;
  pool: any | null;
  rfq: any | null;
  quotes: any[];
  po: any | null;
}

export default function Trazabilidad() {
  const [search, setSearch] = useState("");
  const [selectedChain, setSelectedChain] = useState<TraceChain | null>(null);

  // Fetch requests with related data to build chains
  const { data: requests, isLoading } = useQuery({
    queryKey: ["traceability-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("*, request_items(*), architects:architect_id(full_name), projects:project_id(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: poolRequests } = useQuery({
    queryKey: ["traceability-pool-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pool_requests")
        .select("*, purchase_pools:pool_id(id, name, status, deadline)");
      if (error) throw error;
      return data;
    },
  });

  const { data: rfqs } = useQuery({
    queryKey: ["traceability-rfqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select("*, rfq_items(*), rfq_providers(*, providers:provider_id(name))");
      if (error) throw error;
      return data;
    },
  });

  const { data: quotes } = useQuery({
    queryKey: ["traceability-quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, providers:provider_id(name), quote_items(*)");
      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["traceability-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, providers:provider_id(name)");
      if (error) throw error;
      return data;
    },
  });

  // Build chains
  const chains: TraceChain[] = (requests || []).map((req) => {
    const pr = (poolRequests || []).find((p: any) => p.request_id === req.id);
    const pool = pr ? (pr as any).purchase_pools : null;

    // Find RFQ linked to this request directly or via pool
    let rfq = (rfqs || []).find((r: any) => r.request_id === req.id);
    if (!rfq && pool) {
      rfq = (rfqs || []).find((r: any) => r.pool_id === pool.id);
    }

    const rfqQuotes = rfq ? (quotes || []).filter((q: any) => q.rfq_id === rfq!.id) : [];
    const po = rfq ? (orders || []).find((o: any) => o.rfq_id === rfq!.id) : null;

    return { request: req, pool, rfq, quotes: rfqQuotes, po };
  });

  // Filter
  const filtered = chains.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      String(c.request.request_number).includes(s) ||
      c.request.raw_message?.toLowerCase().includes(s) ||
      c.pool?.name?.toLowerCase().includes(s) ||
      c.rfq?.id?.toLowerCase().includes(s) ||
      c.po?.id?.toLowerCase().includes(s)
    );
  });

  // Determine furthest step for badge
  function chainStage(c: TraceChain): { label: string; icon: typeof Inbox; color: string } {
    if (c.po) return { label: "OC Emitida", icon: ShoppingCart, color: "text-green-600" };
    if (c.quotes.length > 0) return { label: "Cotizado", icon: BarChart3, color: "text-blue-600" };
    if (c.rfq) return { label: "En Solicitud", icon: FileText, color: "text-orange-600" };
    if (c.pool) return { label: "En Pool", icon: Layers, color: "text-purple-600" };
    return { label: "Pedido", icon: Inbox, color: "text-muted-foreground" };
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Trazabilidad</h1>
        <p className="text-muted-foreground text-sm mt-1">Cadena completa: Pedido → Pool → Solicitud → Cotización → OC</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por ID, mensaje, pool..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Chain list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No se encontraron registros.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((chain) => {
            const stage = chainStage(chain);
            const StageIcon = stage.icon;
            return (
              <Card
                key={chain.request.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedChain(chain)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Visual chain steps */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {/* Request */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Inbox className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium">Pedido #{chain.request.request_number}</span>
                      </div>

                      {chain.pool && (
                        <>
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div className="flex items-center gap-1 shrink-0">
                            <Layers className="h-3.5 w-3.5 text-purple-500" />
                            <span className="text-xs">{chain.pool.name}</span>
                          </div>
                        </>
                      )}

                      {chain.rfq && (
                        <>
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div className="flex items-center gap-1 shrink-0">
                            <FileText className="h-3.5 w-3.5 text-orange-500" />
                            <span className="text-xs">SC #{chain.rfq.id.slice(0, 6)}</span>
                          </div>
                        </>
                      )}

                      {chain.quotes.length > 0 && (
                        <>
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div className="flex items-center gap-1 shrink-0">
                            <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                            <span className="text-xs">{chain.quotes.length} cotiz.</span>
                          </div>
                        </>
                      )}

                      {chain.po && (
                        <>
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div className="flex items-center gap-1 shrink-0">
                            <ShoppingCart className="h-3.5 w-3.5 text-green-600" />
                            <span className="text-xs">OC #{chain.po.id.slice(0, 6)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Stage badge */}
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      <StageIcon className={`h-3 w-3 mr-1 ${stage.color}`} />
                      {stage.label}
                    </Badge>

                    {/* Date */}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(chain.request.created_at).toLocaleDateString("es-MX")}
                    </span>
                  </div>

                  {chain.request.raw_message && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1 pl-6">
                      {chain.request.raw_message}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedChain} onOpenChange={(o) => !o && setSelectedChain(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Cadena de Trazabilidad</DialogTitle>
          </DialogHeader>
          {selectedChain && (
            <div className="space-y-4">
              {/* Step 1: Request */}
              <StepCard
                icon={Inbox}
                iconColor="text-primary"
                title="Pedido"
                displayId={`#${selectedChain.request.request_number}`}
                status={selectedChain.request.status}
                date={selectedChain.request.created_at}
              >
                {selectedChain.request.raw_message && (
                  <p className="text-xs text-muted-foreground">{selectedChain.request.raw_message}</p>
                )}
                {(selectedChain.request as any).projects?.name && (
                  <p className="text-xs"><span className="text-muted-foreground">Proyecto:</span> {(selectedChain.request as any).projects.name}</p>
                )}
                {(selectedChain.request as any).architects?.full_name && (
                  <p className="text-xs"><span className="text-muted-foreground">Arquitecto:</span> {(selectedChain.request as any).architects.full_name}</p>
                )}
                {selectedChain.request.request_items?.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {selectedChain.request.request_items.map((it: any) => (
                      <p key={it.id} className="text-xs">• {it.description} — {it.quantity} {it.unit}</p>
                    ))}
                  </div>
                )}
              </StepCard>

              {/* Step 2: Pool (optional) */}
              {selectedChain.pool ? (
                <StepCard
                  icon={Layers}
                  iconColor="text-purple-500"
                  title="Pool de Compra"
                  id={selectedChain.pool.id}
                  status={selectedChain.pool.status}
                  subtitle={selectedChain.pool.name}
                >
                  {selectedChain.pool.deadline && (
                    <p className="text-xs"><span className="text-muted-foreground">Deadline:</span> {new Date(selectedChain.pool.deadline).toLocaleDateString("es-MX")}</p>
                  )}
                </StepCard>
              ) : (
                <StepEmpty label="Sin pool — flujo directo" />
              )}

              {/* Step 3: RFQ */}
              {selectedChain.rfq ? (
                <StepCard
                  icon={FileText}
                  iconColor="text-orange-500"
                  title="Solicitud"
                  id={selectedChain.rfq.id}
                  status={selectedChain.rfq.status}
                  date={selectedChain.rfq.created_at}
                >
                  {(selectedChain.rfq as any).delivery_location && (
                    <p className="text-xs truncate" title={(selectedChain.rfq as any).delivery_location}>📍 {(selectedChain.rfq as any).delivery_location}</p>
                  )}
                  {selectedChain.rfq.rfq_providers?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selectedChain.rfq.rfq_providers as any[]).map((rp: any) => (
                        <Badge key={rp.id} variant="secondary" className="text-[10px]">
                          {rp.providers?.name || "Proveedor"}
                        </Badge>
                      ))}
                    </div>
                  )}
                </StepCard>
              ) : (
                <StepEmpty label="Sin solicitud generada" />
              )}

              {/* Step 4: Quotes */}
              {selectedChain.quotes.length > 0 ? (
                <StepCard
                  icon={BarChart3}
                  iconColor="text-blue-500"
                  title={`Cotizaciones (${selectedChain.quotes.length})`}
                >
                  <div className="space-y-2">
                    {selectedChain.quotes.map((q: any) => (
                      <div key={q.id} className="flex items-center justify-between text-xs border-b pb-1 last:border-0">
                        <span className="font-medium">{q.providers?.name || "Proveedor"}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono">${Number(q.total_price || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                          {q.delivery_days && <span className="text-muted-foreground">{q.delivery_days}d</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </StepCard>
              ) : selectedChain.rfq ? (
                <StepEmpty label="Sin cotizaciones recibidas" />
              ) : null}

              {/* Step 5: PO */}
              {selectedChain.po ? (
                <StepCard
                  icon={ShoppingCart}
                  iconColor="text-green-600"
                  title="Orden de Compra"
                  id={selectedChain.po.id}
                  status={selectedChain.po.status}
                  date={selectedChain.po.created_at}
                >
                  <p className="text-xs">
                    <span className="text-muted-foreground">Proveedor:</span> {(selectedChain.po as any).providers?.name}
                  </p>
                  {selectedChain.po.total_amount && (
                    <p className="text-xs font-mono font-semibold">
                      ${Number(selectedChain.po.total_amount).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </StepCard>
              ) : selectedChain.rfq ? (
                <StepEmpty label="Sin orden de compra" />
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Sub-components ---

function StepCard({
  icon: Icon,
  iconColor,
  title,
  id,
  displayId,
  status,
  date,
  subtitle,
  children,
}: {
  icon: any;
  iconColor: string;
  title: string;
  id?: string;
  displayId?: string;
  status?: string;
  date?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const st = status ? getStatus(status) : null;
  const shownId = displayId || (id ? `#${id.slice(0, 8)}` : null);
  return (
    <div className="border rounded-lg p-3 relative">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="text-sm font-semibold font-display">{title}</span>
        {shownId && <span className="text-[10px] text-muted-foreground font-mono">{shownId}</span>}
        {st && <Badge variant={st.variant} className="text-[10px] ml-auto">{st.label}</Badge>}
      </div>
      {subtitle && <p className="text-xs font-medium mb-1">{subtitle}</p>}
      {date && (
        <p className="text-[10px] text-muted-foreground mb-1">
          {new Date(date).toLocaleString("es-MX")}
        </p>
      )}
      {children}
      {/* Connector line */}
      <div className="absolute -bottom-4 left-5 w-px h-4 bg-border" />
    </div>
  );
}

function StepEmpty({ label }: { label: string }) {
  return (
    <div className="relative">
      <div className="border border-dashed rounded-lg p-2.5 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <div className="absolute -bottom-4 left-5 w-px h-4 bg-border" />
    </div>
  );
}
