/**
 * PoolFlowPanel
 *
 * Renders all pool-flow actions and the consolidated view for a single pool.
 * Uses usePoolFlow (per-pool hook) and gates actions based on pool_state and
 * membership.
 *
 * Actions gated by state:
 *  - "Agregar mis requerimientos" — available in borrador (member only)
 *  - "Consolidar" — available in borrador (member only)
 *  - "Confirmar participación" — available in borrador (member only)
 *  - "Generar cotización compartida" — available when pool_state = confirmado (member only)
 *
 * The consolidated view is shown whenever there are pool_items (any state).
 * Members see totals + per-company contributions (RLS enforces confidentiality
 * of the underlying pool_requests — we never try to display them here).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { usePoolFlow } from "@/hooks/usePoolFlow";
import { usePoolLifecycle } from "@/hooks/usePoolLifecycle";
import { AddMyRequirementsDialog } from "./AddMyRequirementsDialog";
import { PoolConsolidatedView } from "./PoolConsolidatedView";
import { PoolAwardPanel } from "./PoolAwardPanel";
import { PoolProvidersPanel } from "./PoolProvidersPanel";
import {
  PackagePlus,
  Layers,
  CheckCircle,
  FileText,
  LogOut,
  XCircle,
} from "lucide-react";

interface PoolCompanyRow {
  id: string;
  company_id: string;
  status: string;
  companies?: { name: string } | null;
}

interface PoolRequestRow {
  request_id: string;
}

interface Props {
  pool: {
    id: string;
    pool_state: string;
    pool_companies: PoolCompanyRow[];
    pool_requests: PoolRequestRow[];
  };
  /** The viewer's own company_id. */
  companyId: string | null;
  /** All companies map for resolving contribution labels. */
  companyNames: Map<string, string>;
}

export function PoolFlowPanel({ pool, companyId, companyNames }: Props) {
  const { toast } = useToast();
  const [addReqOpen, setAddReqOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  const {
    poolItems,
    contributions,
    isLoadingItems,
    addMyRequirements,
    isAddingRequirements,
    consolidate,
    isConsolidating,
    confirmParticipation,
    isConfirming,
    generateSharedRfq,
    isGeneratingRfq,
  } = usePoolFlow(pool.id);

  const { withdrawFromPool, isWithdrawing, cancelPool, isCancelling } =
    usePoolLifecycle();

  // Membership check — viewer must be in pool_companies to act.
  const isMember =
    !!companyId &&
    (pool.pool_companies ?? []).some((pc) => pc.company_id === companyId);

  if (!isMember) return null;

  const poolState = pool.pool_state ?? "borrador";
  const isBorrador = poolState === "borrador";
  const isConfirmado = poolState === "confirmado";
  const isClosed = poolState === "cerrado" || poolState === "cancelado";
  const isAwardPhase =
    poolState === "en_comparativa" ||
    poolState === "adjudicado" ||
    poolState === "cerrado" ||
    poolState === "cancelado";

  // GAP4: Visibility rules per pool_state.
  // Withdraw: only in borrador.
  const canWithdraw = isBorrador;
  // Cancel: available unless closed (cerrado or cancelado).
  const canCancel = !isClosed;

  // Requests already contributed by the viewer to this pool.
  const alreadyAddedRequestIds = (pool.pool_requests ?? []).map(
    (pr) => pr.request_id
  );

  const handleConsolidate = async () => {
    try {
      await consolidate(pool.id);
      toast({ title: "Consolidación completada" });
    } catch (e: any) {
      toast({
        title: "Error al consolidar",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleConfirmParticipation = async () => {
    try {
      await confirmParticipation(pool.id);
      toast({ title: "Participación confirmada" });
    } catch (e: any) {
      toast({
        title: "Error al confirmar",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleGenerateRfq = async () => {
    try {
      const rfqId = await generateSharedRfq(pool.id);
      toast({
        title: "Cotización compartida generada",
        description: `RFQ creado: ${rfqId.slice(0, 8)}. El pool está en comparativa.`,
      });
    } catch (e: any) {
      toast({
        title: "Error al generar cotización",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleWithdraw = async () => {
    try {
      await withdrawFromPool(pool.id);
      toast({ title: "Te retiraste del pool" });
    } catch (e: any) {
      toast({
        title: "Error al retirarse del pool",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelPool(pool.id);
      toast({ title: "Pool cancelado" });
    } catch (e: any) {
      toast({
        title: "Error al cancelar el pool",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleAddRequirements = async (requestIds: string[]) => {
    try {
      await addMyRequirements(pool.id, requestIds);
      toast({
        title: "Requerimientos agregados",
        description: `${requestIds.length} requerimiento${requestIds.length !== 1 ? "s" : ""} agregado${requestIds.length !== 1 ? "s" : ""} al pool.`,
      });
      setAddReqOpen(false);
    } catch (e: any) {
      toast({
        title: "Error al agregar requerimientos",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // Award phase (en_comparativa / adjudicado / cerrado) — delegate entirely to
  // PoolAwardPanel which owns its own usePoolAward hook. The pre-award states
  // (borrador / confirmado) keep the existing consolidated view + flow actions.
  if (isAwardPhase) {
    const memberCompanyIds = (pool.pool_companies ?? []).map(
      (pc) => pc.company_id
    );
    return (
      <PoolAwardPanel
        poolId={pool.id}
        poolState={
          poolState as "en_comparativa" | "adjudicado" | "cerrado" | "cancelado"
        }
        companyNames={companyNames}
        companyId={companyId!}
        memberCompanyIds={memberCompanyIds}
      />
    );
  }

  return (
    <div className="space-y-4 pt-2 border-t">
      {/* Consolidated view */}
      <PoolConsolidatedView
        poolItems={poolItems}
        contributions={contributions}
        companyNames={companyNames}
        isLoading={isLoadingItems}
      />

      {/* GAP3: Provider selection panel — available in borrador and confirmado
          so members can choose their providers before generateSharedRfq is called. */}
      <div className="pt-2 border-t">
        <h3 className="text-sm font-semibold mb-2">Proveedores del pool</h3>
        <PoolProvidersPanel poolId={pool.id} companyId={companyId!} />
      </div>

      {/* Pool-flow actions */}
      <div className="flex gap-2 flex-wrap">
        {/* Agregar mis requerimientos — only in borrador */}
        {isBorrador && (
          <Dialog open={addReqOpen} onOpenChange={setAddReqOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isAddingRequirements}>
                <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                Agregar mis requerimientos
              </Button>
            </DialogTrigger>
            {addReqOpen && (
              <AddMyRequirementsDialog
                poolId={pool.id}
                companyId={companyId!}
                alreadyAddedRequestIds={alreadyAddedRequestIds}
                isPending={isAddingRequirements}
                onSubmit={handleAddRequirements}
                onClose={() => setAddReqOpen(false)}
              />
            )}
          </Dialog>
        )}

        {/* Consolidar — only in borrador */}
        {isBorrador && (
          <Button
            variant="outline"
            size="sm"
            disabled={isConsolidating || !alreadyAddedRequestIds.length}
            onClick={handleConsolidate}
            title={
              !alreadyAddedRequestIds.length
                ? "Primero agregá tus requerimientos al pool"
                : undefined
            }
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            {isConsolidating ? "Consolidando..." : "Consolidar"}
          </Button>
        )}

        {/* Confirmar participación — only in borrador */}
        {isBorrador && (
          <Button
            variant="outline"
            size="sm"
            disabled={isConfirming}
            onClick={handleConfirmParticipation}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            {isConfirming ? "Confirmando..." : "Confirmar participación"}
          </Button>
        )}

        {/* Generar cotización compartida — only when confirmado */}
        {isConfirmado && (
          <Button
            size="sm"
            disabled={isGeneratingRfq || !poolItems.length}
            onClick={handleGenerateRfq}
            title={
              !poolItems.length
                ? "El pool no tiene ítems consolidados"
                : undefined
            }
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            {isGeneratingRfq
              ? "Generando cotización..."
              : "Generar cotización compartida"}
          </Button>
        )}
      </div>

      {/* GAP4: Withdraw / Cancel actions — separated from flow actions for clarity */}
      {(canWithdraw || canCancel) && (
        <div className="flex gap-2 flex-wrap pt-2 border-t">
          {/* Retirarse del pool — only in borrador */}
          {canWithdraw && (
            <AlertDialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isWithdrawing}
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  Retirarse del pool
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Retirarse del pool?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará tu empresa del pool. Si sos el creador
                    y no quedan otros miembros, el pool pasará a cancelado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setWithdrawDialogOpen(false);
                      handleWithdraw();
                    }}
                  >
                    Retirarme
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Cancelar Pool — visible when NOT in cerrado/cancelado */}
          {canCancel && (
            <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isCancelling}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Cancelar pool
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Cancelar el pool?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción es irreversible y afecta a todos los participantes
                    del pool. El pool pasará al estado cancelado y no se podrán
                    realizar más acciones.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setCancelDialogOpen(false);
                      handleCancel();
                    }}
                  >
                    Confirmar cancelación
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}
