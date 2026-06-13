import { useState } from "react";
import { useViewRole } from "@/hooks/useViewRole";
import { useCompanyLinks } from "@/hooks/useCompanyLinks";
import { useMaterialMappings } from "@/hooks/useMaterialMappings";
import { isMappingUsable, isLinkActive, linkRoleForCompany } from "@/lib/pool-foundation-utils";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Layers,
  ArrowRightLeft,
  CheckCircle2,
  CircleDashed,
  PackageCheck,
  AlertCircle,
} from "lucide-react";
import type { CompanyLinkWithNames } from "@/hooks/useCompanyLinks";
import type { MaterialMappingWithMaterials } from "@/hooks/useMaterialMappings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPartnerCompanyId(
  link: CompanyLinkWithNames,
  myCompanyId: string
): string | null {
  if (link.requester_company_id === myCompanyId) return link.target_company_id;
  if (link.target_company_id === myCompanyId) return link.requester_company_id;
  return null;
}

function getPartnerName(
  link: CompanyLinkWithNames,
  myCompanyId: string
): string {
  const role = linkRoleForCompany(link, myCompanyId);
  if (role === "requester") return link.target_company?.name ?? "Empresa desconocida";
  if (role === "target") return link.requester_company?.name ?? "Empresa desconocida";
  return "Empresa desconocida";
}

// ---------------------------------------------------------------------------
// Confirmation state badge
// ---------------------------------------------------------------------------

function ConfirmationBadge({
  confirmedByRequester,
  confirmedByTarget,
}: {
  confirmedByRequester: boolean;
  confirmedByTarget: boolean;
}) {
  if (confirmedByRequester && confirmedByTarget) {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 gap-1 shrink-0">
        <PackageCheck className="h-3 w-3" />
        Usable
      </Badge>
    );
  }

  const parts: string[] = [];
  if (confirmedByRequester) parts.push("solicitante");
  if (confirmedByTarget) parts.push("destino");
  const who = parts.length > 0 ? `Confirmado: ${parts.join(" + ")}` : "Sin confirmar";

  return (
    <Badge
      variant="outline"
      className="text-amber-700 border-amber-300 bg-amber-50 gap-1 shrink-0 whitespace-nowrap"
    >
      <CircleDashed className="h-3 w-3" />
      {who}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Mapping row
// ---------------------------------------------------------------------------

function MappingRow({
  mapping,
  myRole,
  onConfirm,
  isConfirming,
}: {
  mapping: MaterialMappingWithMaterials;
  myRole: "requester" | "target" | null;
  onConfirm: (id: string) => void;
  isConfirming: boolean;
}) {
  const usable = isMappingUsable(mapping);

  // Determine whether MY side has already confirmed this mapping.
  const iConfirmed =
    myRole === "requester"
      ? mapping.confirmed_by_requester
      : myRole === "target"
      ? mapping.confirmed_by_target
      : true; // if role is unknown, don't show confirm button

  const materialAName = mapping.material_a?.name ?? mapping.material_a_id;
  const materialBName = mapping.material_b?.name ?? mapping.material_b_id;

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{materialAName}</span>
          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{materialBName}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ConfirmationBadge
            confirmedByRequester={mapping.confirmed_by_requester}
            confirmedByTarget={mapping.confirmed_by_target}
          />
          {usable && (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1 shrink-0">
              <CheckCircle2 className="h-3 w-3" />
              Lista para pool
            </Badge>
          )}
        </div>
      </div>

      {!iConfirmed && myRole !== null && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onConfirm(mapping.id)}
          disabled={isConfirming}
          className="shrink-0 gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Confirmar
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapping form — pick own material + partner material and propose
// ---------------------------------------------------------------------------

function MappingForm({
  link,
  myCompanyId,
  onPropose,
  isProposing,
  existingMappings,
}: {
  link: CompanyLinkWithNames;
  myCompanyId: string;
  onPropose: (materialAId: string, materialBId: string) => void;
  isProposing: boolean;
  existingMappings: MaterialMappingWithMaterials[];
}) {
  const [selectedOwnId, setSelectedOwnId] = useState<string>("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");

  const partnerCompanyId = getPartnerCompanyId(link, myCompanyId);

  const { ownMaterials, partnerMaterials, isLoading } = useMaterialMappings(
    link.id,
    partnerCompanyId
  );

  const myRole = linkRoleForCompany(link, myCompanyId);

  // Check for an existing mapping with this exact pair (db also enforces UNIQUE,
  // but surface a friendly inline warning before the user hits submit).
  const isDuplicate =
    selectedOwnId !== "" &&
    selectedPartnerId !== "" &&
    existingMappings.some((m) => {
      // materialAId is always the requester's material, materialBId the target's.
      // Regardless of who I am, a pair (ownId, partnerId) maps to specific a/b slots.
      if (myRole === "requester") {
        return m.material_a_id === selectedOwnId && m.material_b_id === selectedPartnerId;
      }
      // I'm the target: my material is in b slot, partner's in a slot.
      return m.material_b_id === selectedOwnId && m.material_a_id === selectedPartnerId;
    });

  function handlePropose() {
    if (!selectedOwnId || !selectedPartnerId) return;

    // Orient correctly per AD-2:
    // material_a = requester company's material
    // material_b = target company's material
    const materialAId = myRole === "requester" ? selectedOwnId : selectedPartnerId;
    const materialBId = myRole === "requester" ? selectedPartnerId : selectedOwnId;

    onPropose(materialAId, materialBId);
    setSelectedOwnId("");
    setSelectedPartnerId("");
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const partnerName = getPartnerName(link, myCompanyId);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tu material
          </p>
          <Select value={selectedOwnId} onValueChange={setSelectedOwnId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {ownMaterials.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Sin materiales en tu catálogo
                </div>
              ) : (
                ownMaterials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    {m.sku ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({m.sku})
                      </span>
                    ) : null}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Material de {partnerName}
          </p>
          <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {partnerMaterials.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Sin materiales visibles del partner
                </div>
              ) : (
                partnerMaterials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    {m.sku ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({m.sku})
                      </span>
                    ) : null}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isDuplicate && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Este par de materiales ya tiene un mapeo para este vínculo.
        </div>
      )}

      <Button
        onClick={handlePropose}
        disabled={
          isProposing ||
          !selectedOwnId ||
          !selectedPartnerId ||
          isDuplicate
        }
        size="sm"
        className="gap-2"
      >
        <ArrowRightLeft className="h-4 w-4" />
        {isProposing ? "Mapeando..." : "Mapear"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Link selector + content pane
// ---------------------------------------------------------------------------

function LinkPane({
  activeLinks,
  myCompanyId,
}: {
  activeLinks: CompanyLinkWithNames[];
  myCompanyId: string;
}) {
  const [selectedLinkId, setSelectedLinkId] = useState<string>(
    activeLinks[0]?.id ?? ""
  );

  const selectedLink = activeLinks.find((l) => l.id === selectedLinkId) ?? null;
  const partnerCompanyId = selectedLink
    ? getPartnerCompanyId(selectedLink, myCompanyId)
    : null;
  const myRole = selectedLink ? linkRoleForCompany(selectedLink, myCompanyId) : null;

  const { mappings, isLoading, error, propose, isProposing, confirm, isConfirming } =
    useMaterialMappings(selectedLinkId || null, partnerCompanyId);

  function handlePropose(materialAId: string, materialBId: string) {
    propose(materialAId, materialBId);
    toast.info("Mapeo propuesto — esperá que la otra empresa confirme");
  }

  function handleConfirm(mappingId: string) {
    confirm(mappingId);
    toast.success("Mapeo confirmado");
  }

  return (
    <div className="space-y-4">
      {/* Link selector */}
      {activeLinks.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Vínculo activo</p>
          <Select value={selectedLinkId} onValueChange={setSelectedLinkId}>
            <SelectTrigger className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeLinks.map((link) => (
                <SelectItem key={link.id} value={link.id}>
                  {getPartnerName(link, myCompanyId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {activeLinks.length === 1 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowRightLeft className="h-4 w-4" />
          <span>
            Vínculo con{" "}
            <span className="font-medium text-foreground">
              {getPartnerName(activeLinks[0], myCompanyId)}
            </span>
          </span>
        </div>
      )}

      {selectedLink && (
        <>
          <Separator />

          {/* Propose new mapping */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Crear mapeo</p>
            <MappingForm
              link={selectedLink}
              myCompanyId={myCompanyId}
              onPropose={handlePropose}
              isProposing={isProposing}
              existingMappings={mappings}
            />
          </div>

          <Separator />

          {/* Mapping list */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Mapeos existentes</p>

            {isLoading && (
              <div className="space-y-3 pt-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </div>
            )}

            {!isLoading && error && (
              <div className="py-4 text-sm text-red-600">
                Error al cargar mapeos: {error.message}
              </div>
            )}

            {!isLoading && !error && mappings.length === 0 && (
              <div className="py-8 flex flex-col items-center gap-2 text-center text-muted-foreground">
                <Layers className="h-8 w-8 opacity-30" />
                <p className="text-sm">Sin mapeos todavía</p>
                <p className="text-xs">
                  Seleccioná un material de cada catálogo y hacé clic en &quot;Mapear&quot;
                </p>
              </div>
            )}

            {!isLoading && !error && mappings.length > 0 && (
              <div className="divide-y">
                {mappings.map((mapping) => (
                  <MappingRow
                    key={mapping.id}
                    mapping={mapping}
                    myRole={myRole}
                    onConfirm={handleConfirm}
                    isConfirming={isConfirming}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function PoolMateriasPanel() {
  const { companyId } = useViewRole();
  const { links, isLoading: linksLoading } = useCompanyLinks();

  if (!companyId) return null;

  const activeLinks = links.filter(isLinkActive);

  return (
    <Card className="shadow-soft">
      <CardHeader className="px-6 py-4 border-b bg-muted/20">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Materiales compartidos
        </CardTitle>
        <CardDescription className="text-xs">
          Mapeá tus materiales con los de las empresas vinculadas para habilitar el pool de compras
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6">
        {linksLoading && (
          <div className="space-y-3">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {!linksLoading && activeLinks.length === 0 && (
          <div className="py-8 flex flex-col items-center gap-2 text-center text-muted-foreground">
            <ArrowRightLeft className="h-8 w-8 opacity-30" />
            <p className="text-sm font-medium">Sin vínculos activos</p>
            <p className="text-xs">
              Vinculá una empresa primero desde el panel &quot;Empresas habilitadas&quot;
            </p>
          </div>
        )}

        {!linksLoading && activeLinks.length > 0 && (
          <LinkPane activeLinks={activeLinks} myCompanyId={companyId} />
        )}
      </CardContent>
    </Card>
  );
}
