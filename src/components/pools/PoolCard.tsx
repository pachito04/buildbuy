import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Layers, Plus, ArrowRight, Building2, Users } from "lucide-react";

const poolStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Abierto", variant: "default" },
  closed: { label: "Cerrado", variant: "secondary" },
  quoting: { label: "Cotizando", variant: "outline" },
  awarded: { label: "Adjudicado", variant: "default" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

interface Props {
  pool: any;
  approvedRequests: any[];
  companies: { id: string; name: string }[];
  userCompanyId: string | null;
  onAddRequests: (poolId: string, requestIds: string[]) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onInviteCompany: (poolId: string, companyId: string) => void;
  addRequestsPending: boolean;
}

export function PoolCard({
  pool,
  approvedRequests,
  companies,
  userCompanyId,
  onAddRequests,
  onUpdateStatus,
  onInviteCompany,
  addRequestsPending,
}: Props) {
  const [addReqOpen, setAddReqOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedReqs, setSelectedReqs] = useState<string[]>([]);
  const [inviteCompanyId, setInviteCompanyId] = useState("");

  const poolReqs = (pool.pool_requests as any[]) || [];
  const poolCompanies = (pool.pool_companies as any[]) || [];
  const allItems: any[] = poolReqs.flatMap((pr: any) => pr.requests?.request_items || []);

  // Consolidate items
  const consolidated = allItems.reduce(
    (acc: Record<string, { description: string; quantity: number; unit: string }>, item: any) => {
      const key = `${item.description.toLowerCase()}_${item.unit}`;
      if (!acc[key]) acc[key] = { description: item.description, quantity: 0, unit: item.unit };
      acc[key].quantity += Number(item.quantity);
      return acc;
    },
    {}
  );

  const existingCompanyIds = poolCompanies.map((pc: any) => pc.company_id || pc.companies?.id);
  const availableCompanies = companies.filter(
    (c) => !existingCompanyIds.includes(c.id) && c.id !== userCompanyId
  );

  const toggleReq = (id: string) => {
    setSelectedReqs((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Layers className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-display">{pool.name}</CardTitle>
          <Badge variant={poolStatusLabels[pool.status]?.variant || "secondary"}>
            {poolStatusLabels[pool.status]?.label || pool.status}
          </Badge>
          {pool.is_shared && (
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" />
              Inter-Empresa
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {pool.deadline
            ? `Límite: ${new Date(pool.deadline).toLocaleDateString("es-MX")}`
            : "Sin fecha límite"}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {pool.notes && <p className="text-sm text-muted-foreground">{pool.notes}</p>}

        {/* Participating companies */}
        {poolCompanies.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {poolCompanies.map((pc: any) => (
              <Badge key={pc.id} variant="secondary" className="text-xs gap-1">
                {pc.companies?.name || "Empresa"}
                {pc.status === "invited" && (
                  <span className="text-muted-foreground">(invitada)</span>
                )}
              </Badge>
            ))}
          </div>
        )}

        <div className="text-sm text-muted-foreground">{poolReqs.length} pedido(s) en este pool</div>

        {/* Consolidated items table */}
        {Object.values(consolidated).length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
              Ítems Consolidados
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-1.5">Ítem</th>
                  <th className="text-right px-3 py-1.5">Total</th>
                  <th className="text-left px-3 py-1.5">Unidad</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(consolidated).map((item: any, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5">{item.description}</td>
                    <td className="text-right px-3 py-1.5 font-medium">{item.quantity}</td>
                    <td className="px-3 py-1.5">{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {pool.status === "open" && (
            <>
              {/* Add requests */}
              <Dialog
                open={addReqOpen}
                onOpenChange={(o) => {
                  setAddReqOpen(o);
                  if (!o) setSelectedReqs([]);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-3 w-3 mr-1" />
                    Agregar Pedidos
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Agregar Pedidos al Pool</DialogTitle>
                  </DialogHeader>
                  {!approvedRequests.length ? (
                    <p className="text-sm text-muted-foreground py-4">
                      No hay pedidos aprobados disponibles.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                      {approvedRequests.map((r) => (
                        <div key={r.id} className="flex items-start gap-3 p-3 border rounded-lg">
                          <Checkbox
                            checked={selectedReqs.includes(r.id)}
                            onCheckedChange={() => toggleReq(r.id)}
                          />
                          <div>
                            <p className="text-sm font-medium">#{r.id.slice(0, 8)}</p>
                            {r.raw_message && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {r.raw_message}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {r.request_items?.length || 0} ítems
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    disabled={!selectedReqs.length || addRequestsPending}
                    onClick={() => {
                      onAddRequests(pool.id, selectedReqs);
                      setAddReqOpen(false);
                      setSelectedReqs([]);
                    }}
                    className="w-full"
                  >
                    Agregar {selectedReqs.length} pedido(s)
                  </Button>
                </DialogContent>
              </Dialog>

              {/* Invite company */}
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Users className="h-3 w-3 mr-1" />
                    Invitar Empresa
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invitar Empresa al Pool</DialogTitle>
                  </DialogHeader>
                  {availableCompanies.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                      No hay empresas disponibles para invitar.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <Select value={inviteCompanyId} onValueChange={setInviteCompanyId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar empresa..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCompanies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        disabled={!inviteCompanyId}
                        onClick={() => {
                          onInviteCompany(pool.id, inviteCompanyId);
                          setInviteOpen(false);
                          setInviteCompanyId("");
                        }}
                        className="w-full"
                      >
                        Invitar
                      </Button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              <Button
                size="sm"
                onClick={() => onUpdateStatus(pool.id, "closed")}
              >
                Cerrar Pool <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </>
          )}
          {pool.status === "closed" && (
            <Button
              size="sm"
              onClick={() => onUpdateStatus(pool.id, "quoting")}
            >
              Iniciar Cotización <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
