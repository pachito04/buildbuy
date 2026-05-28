import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { useUrgencyThreshold } from "@/hooks/useUrgencyThreshold";
import { useRequestsQuery } from "@/hooks/useRequestsQuery";
import { useStatusTransition } from "@/hooks/useStatusTransition";
import { useRejectionMutation } from "@/hooks/useRejectionMutation";
import { KanbanBoard } from "@/components/pedidos/KanbanBoard";
import { RequestDetailModal } from "@/components/pedidos/RequestDetailModal";
import { RejectionModal } from "@/components/pedidos/RejectionModal";
import { CreateRequestDialog } from "@/components/pedidos/CreateRequestDialog";
import { SurtidoDialog } from "@/components/pedidos/SurtidoDialog";
import { SolicitudDirectaDialog } from "@/components/pedidos/SolicitudDirectaDialog";
import type { RequestStatus } from "@/lib/kanban-types";

interface KanbanFilters {
  obraFilter: string;
  urgenteOnly: boolean;
  searchQuery: string;
}

const STORAGE_KEY = 'kanban-filters';

function loadFilters(): KanbanFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { obraFilter: 'all', urgenteOnly: false, searchQuery: '' };
}

export default function Pedidos() {
  const { obraId } = useParams<{ obraId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const reqId = searchParams.get('req');

  const { companyId, viewRole: role } = useViewRole();
  const thresholdDays = useUrgencyThreshold();

  const [filters, setFilters] = useState<KanbanFilters>(() => {
    const saved = loadFilters();
    return obraId ? { ...saved, obraFilter: obraId } : saved;
  });

  const [rejectionTarget, setRejectionTarget] = useState<{
    requestId: string;
    requestNumber: number;
  } | null>(null);

  const [surtidoTarget, setSurtidoTarget] = useState<{
    requestId: string;
    requestNumber: number;
    projectName: string | null;
    createdBy: string | null;
  } | null>(null);

  const [solicitudTarget, setSolicitudTarget] = useState<{
    requestId: string;
    requestNumber: number;
    projectName: string | null;
    desiredDate: string | null;
  } | null>(null);

  useEffect(() => {
    if (!obraId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    }
  }, [filters, obraId]);

  const effectiveObraId = obraId ?? (filters.obraFilter !== 'all' ? filters.obraFilter : undefined);

  const { data: requests = [], isLoading, isError, refetch } = useRequestsQuery(companyId, effectiveObraId);

  const statusTransition = useStatusTransition(companyId);
  const rejectionMutation = useRejectionMutation(companyId);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const handleCardClick = (requestId: string) => {
    setSearchParams({ req: requestId });
  };

  const handleDetailModalClose = () => {
    setSearchParams({}, { replace: true });
  };

  const handleStatusChange = (requestId: string, newStatus: RequestStatus) => {
    statusTransition.mutate(
      { requestId, newStatus },
      {
        onSuccess: () => toast.success(`Movido a ${newStatus.replace(/_/g, ' ')}`),
        onError: () => toast.error('Error al cambiar el estado'),
      }
    );
  };

  const handleRejectRequest = (requestId: string, requestNumber: number) => {
    setRejectionTarget({ requestId, requestNumber });
  };

  const handleRejectionConfirm = (reason: string, note: string | null) => {
    if (!rejectionTarget) return;
    rejectionMutation.mutate(
      { requestId: rejectionTarget.requestId, reason, note },
      {
        onSuccess: () => {
          toast.success('Requerimiento rechazado');
          setRejectionTarget(null);
        },
        onError: () => toast.error('Error al rechazar el requerimiento'),
      }
    );
  };

  const handleRejectionCancel = () => {
    setRejectionTarget(null);
  };

  const handleSurtir = (requestId: string, requestNumber: number, projectName: string | null, createdBy: string | null) => {
    setSurtidoTarget({ requestId, requestNumber, projectName, createdBy });
  };

  const handleSolicitudDirecta = (requestId: string, requestNumber: number, projectName: string | null, desiredDate: string | null) => {
    setSolicitudTarget({ requestId, requestNumber, projectName, desiredDate });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Requerimientos</h1>

        <Select
          value={obraId ?? filters.obraFilter}
          onValueChange={(v) => setFilters(f => ({ ...f, obraFilter: v }))}
          disabled={!!obraId}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas las obras" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las obras</SelectItem>
            {projects?.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            id="urgente-toggle"
            checked={filters.urgenteOnly}
            onCheckedChange={(checked) => setFilters(f => ({ ...f, urgenteOnly: checked }))}
          />
          <Label htmlFor="urgente-toggle" className="text-sm">Solo urgentes</Label>
        </div>

        <Input
          placeholder="Buscar por REQ o nombre de obra..."
          className="max-w-xs"
          value={filters.searchQuery}
          onChange={(e) => setFilters(f => ({ ...f, searchQuery: e.target.value }))}
        />

        <div className="ml-auto">
          <CreateRequestDialog />
        </div>
      </div>

      <KanbanBoard
        requests={requests}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        onCardClick={handleCardClick}
        onStatusChange={handleStatusChange}
        onRejectRequest={handleRejectRequest}
        thresholdDays={thresholdDays}
        role={role}
        filters={{
          searchQuery: filters.searchQuery,
          urgenteOnly: filters.urgenteOnly,
        }}
      />

      <RequestDetailModal
        requestId={reqId}
        onClose={handleDetailModalClose}
        onReject={handleRejectRequest}
        onSurtir={handleSurtir}
        onSolicitudDirecta={handleSolicitudDirecta}
      />

      <RejectionModal
        open={!!rejectionTarget}
        requestNumber={rejectionTarget?.requestNumber ?? 0}
        onConfirm={handleRejectionConfirm}
        onCancel={handleRejectionCancel}
        isPending={rejectionMutation.isPending}
      />

      <SurtidoDialog
        requestId={surtidoTarget?.requestId ?? null}
        requestNumber={surtidoTarget?.requestNumber ?? 0}
        projectName={surtidoTarget?.projectName ?? null}
        createdBy={surtidoTarget?.createdBy ?? null}
        onClose={() => setSurtidoTarget(null)}
      />

      <SolicitudDirectaDialog
        requestId={solicitudTarget?.requestId ?? null}
        requestNumber={solicitudTarget?.requestNumber ?? 0}
        projectName={solicitudTarget?.projectName ?? null}
        desiredDate={solicitudTarget?.desiredDate ?? null}
        onClose={() => setSolicitudTarget(null)}
      />
    </div>
  );
}
