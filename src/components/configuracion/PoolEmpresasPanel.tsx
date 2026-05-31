import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { useCompanyLinks } from "@/hooks/useCompanyLinks";
import { linkRoleForCompany } from "@/lib/pool-foundation-utils";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Search,
  Link2,
  CheckCircle2,
  Clock,
  MinusCircle,
  ArrowRightLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Company {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: "pending" | "active" | "disabled" }) {
  if (status === "active") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Activo
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 gap-1">
        <Clock className="h-3 w-3" />
        Pendiente
      </Badge>
    );
  }
  return (
    <Badge className="bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-100 gap-1">
      <MinusCircle className="h-3 w-3" />
      Deshabilitado
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Company search + request
// ---------------------------------------------------------------------------

function CompanySearch({
  myCompanyId,
  existingTargetIds,
  onRequest,
  isRequesting,
}: {
  myCompanyId: string;
  existingTargetIds: Set<string>;
  onRequest: (targetCompanyId: string) => void;
  isRequesting: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Company | null>(null);

  const { data: companies, isLoading } = useQuery({
    queryKey: ["companies-for-link-search"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Company[];
    },
    staleTime: 60_000,
  });

  const filtered = (companies ?? []).filter(
    (c) =>
      c.id !== myCompanyId &&
      c.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleSelect(company: Company) {
    setSelected(company);
    setSearch(company.name);
  }

  function handleRequest() {
    if (!selected) return;
    onRequest(selected.id);
    setSelected(null);
    setSearch("");
  }

  const alreadyLinked = selected ? existingTargetIds.has(selected.id) : false;
  const showDropdown = search.length > 0 && !selected && filtered.length > 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar empresa por nombre..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (selected && e.target.value !== selected.name) {
                setSelected(null);
              }
            }}
            className="pl-9"
          />
        </div>

        {showDropdown && (
          <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-md max-h-48 overflow-auto">
            {isLoading ? (
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              filtered.map((company) => {
                const linked = existingTargetIds.has(company.id);
                return (
                  <button
                    key={company.id}
                    type="button"
                    disabled={linked}
                    onClick={() => handleSelect(company)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1">{company.name}</span>
                    {linked && (
                      <span className="text-xs text-muted-foreground">ya vinculada</span>
                    )}
                  </button>
                );
              })
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No se encontraron empresas
              </p>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-md border bg-muted/30 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{selected.name}</span>
          </div>
          <Button
            onClick={handleRequest}
            disabled={isRequesting || alreadyLinked}
            size="sm"
            className="gap-2 shrink-0"
          >
            <Link2 className="h-4 w-4" />
            {isRequesting ? "Solicitando..." : "Solicitar vínculo"}
          </Button>
        </div>
      )}

      {selected && alreadyLinked && (
        <p className="text-xs text-amber-700">
          Ya existe un vínculo con esta empresa.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Link row
// ---------------------------------------------------------------------------

function LinkRow({
  link,
  myCompanyId,
  onAccept,
  onDisable,
  onReactivate,
  isAccepting,
  isDisabling,
}: {
  link: ReturnType<typeof useCompanyLinks>["links"][number];
  myCompanyId: string;
  onAccept: (id: string) => void;
  onDisable: (id: string) => void;
  onReactivate: (id: string) => void;
  isAccepting: boolean;
  isDisabling: boolean;
}) {
  const role = linkRoleForCompany(link, myCompanyId);

  // The partner company is the other side of the link
  const partner =
    role === "requester"
      ? link.target_company
      : link.requester_company;

  const partnerName = partner?.name ?? "Empresa desconocida";

  // Label describing who initiated the link
  const roleLabel =
    role === "requester" ? "Vos solicitaste" : "Te solicitaron";

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium text-sm truncate">{partnerName}</span>
          <StatusBadge status={link.status} />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
          <ArrowRightLeft className="h-3 w-3" />
          <span>{roleLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {link.status === "pending" && role === "target" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAccept(link.id)}
            disabled={isAccepting}
            className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Aceptar
          </Button>
        )}

        {link.status === "pending" && role === "requester" && (
          <span className="text-xs text-muted-foreground italic">
            Pendiente de aceptación
          </span>
        )}

        {link.status === "active" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDisable(link.id)}
            disabled={isDisabling}
            className="gap-1.5 text-zinc-600 hover:text-zinc-800"
          >
            <MinusCircle className="h-3.5 w-3.5" />
            Deshabilitar
          </Button>
        )}

        {link.status === "disabled" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReactivate(link.id)}
            disabled={isAccepting}
            className="gap-1.5 text-sky-700 border-sky-300 hover:bg-sky-50 hover:text-sky-800"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Reactivar
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function PoolEmpresasPanel() {
  const { companyId } = useViewRole();

  const {
    links,
    isLoading,
    error,
    request,
    isRequesting,
    accept,
    isAccepting,
    disable,
    isDisabling,
  } = useCompanyLinks();

  // Build the set of companies we already have a link with (in any status)
  // so the search can mark them as "already linked".
  const existingTargetIds = new Set<string>(
    links.map((l) =>
      l.requester_company_id === companyId
        ? l.target_company_id
        : l.requester_company_id
    )
  );

  function handleRequest(targetCompanyId: string) {
    request(targetCompanyId);
    toast.info("Solicitud de vínculo enviada");
  }

  function handleAccept(linkId: string) {
    accept(linkId);
    toast.success("Vínculo aceptado — ahora está activo");
  }

  function handleDisable(linkId: string) {
    disable(linkId);
    toast.info("Vínculo deshabilitado");
  }

  // Re-enable a disabled link: same as accept (→ active) — valid per AD-1 UPDATE rule
  function handleReactivate(linkId: string) {
    accept(linkId);
    toast.success("Vínculo reactivado");
  }

  if (!companyId) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="px-6 py-4 border-b bg-muted/20">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Empresas habilitadas
        </CardTitle>
        <CardDescription className="text-xs">
          Vinculá tu empresa con otras para habilitar el pool de compras compartido
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Search + request */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Solicitar nuevo vínculo</p>
          <CompanySearch
            myCompanyId={companyId}
            existingTargetIds={existingTargetIds}
            onRequest={handleRequest}
            isRequesting={isRequesting}
          />
        </div>

        <Separator />

        {/* Link list */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Vínculos de tu empresa</p>

          {isLoading && (
            <div className="space-y-3 pt-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="py-4 text-sm text-red-600">
              Error al cargar vínculos: {error.message}
            </div>
          )}

          {!isLoading && !error && links.length === 0 && (
            <div className="py-8 flex flex-col items-center gap-2 text-center text-muted-foreground">
              <Link2 className="h-8 w-8 opacity-30" />
              <p className="text-sm">No hay vínculos todavía</p>
              <p className="text-xs">
                Buscá una empresa arriba para solicitar el primer vínculo
              </p>
            </div>
          )}

          {!isLoading && !error && links.length > 0 && (
            <div className="divide-y">
              {links.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  myCompanyId={companyId}
                  onAccept={handleAccept}
                  onDisable={handleDisable}
                  onReactivate={handleReactivate}
                  isAccepting={isAccepting}
                  isDisabling={isDisabling}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
