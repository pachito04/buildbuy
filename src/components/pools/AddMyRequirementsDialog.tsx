/**
 * AddMyRequirementsDialog
 *
 * Lets a pool member pick from their OWN eligible requests (pendiente,
 * deposito delivery, with at least one sin_pedir item with a material_id)
 * and add them to the pool via usePoolFlow.addMyRequirements.
 *
 * Confidentiality: only the viewer's own requests are shown — enforced both
 * by the query (company_id filter via RLS) and by the UI (we only fetch the
 * viewer's own company requests).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PackagePlus } from "lucide-react";

interface EligibleRequest {
  id: string;
  created_at: string;
  raw_message: string | null;
  eligibleItemCount: number;
}

interface Props {
  poolId: string;
  companyId: string;
  /** IDs of requests already in this pool (to exclude from the picker). */
  alreadyAddedRequestIds: string[];
  isPending: boolean;
  onSubmit: (requestIds: string[]) => void;
  onClose: () => void;
}

export function AddMyRequirementsDialog({
  poolId,
  companyId,
  alreadyAddedRequestIds,
  isPending,
  onSubmit,
  onClose,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  // Fetch the viewer's own eligible requests.
  // Eligible: status = pendiente, at least one request_item with
  //   delivery_target = deposito AND status = sin_pedir AND material_id not null.
  // RLS already scopes to the viewer's company, but we also filter by company_id
  // at the query level for clarity and to avoid any RLS misconfiguration.
  const { data: eligibleRequests, isLoading } = useQuery({
    queryKey: ["pool-eligible-requests", companyId, poolId],
    enabled: !!companyId,
    queryFn: async (): Promise<EligibleRequest[]> => {
      const { data, error } = await supabase
        .from("requests")
        .select(
          `id, created_at, raw_message,
           request_items!inner(id, delivery_target, status, material_id)`
        )
        .eq("status", "pendiente")
        .eq("company_id", companyId)
        .eq("request_items.delivery_target", "deposito")
        .eq("request_items.status", "sin_pedir")
        .not("request_items.material_id", "is", null);
      if (error) throw error;

      // Deduplicate: one request may have many eligible items → count them.
      const requestMap = new Map<string, EligibleRequest>();
      for (const row of data ?? []) {
        if (!requestMap.has(row.id)) {
          requestMap.set(row.id, {
            id: row.id,
            created_at: row.created_at,
            raw_message: row.raw_message,
            eligibleItemCount: 0,
          });
        }
        const entry = requestMap.get(row.id)!;
        const items = Array.isArray((row as any).request_items)
          ? (row as any).request_items
          : [(row as any).request_items];
        entry.eligibleItemCount += items.filter(
          (it: any) => it && it.material_id
        ).length;
      }

      return Array.from(requestMap.values()).filter(
        (r) => !alreadyAddedRequestIds.includes(r.id)
      );
    },
  });

  const toggleRequest = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!selected.length) return;
    onSubmit(selected);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4" />
          Agregar mis requerimientos al pool
        </DialogTitle>
        <DialogDescription>
          Solo se muestran tus requerimientos pendientes con ítems aptos para
          pool (material asignado, entrega en depósito).
        </DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <div className="space-y-2 py-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : !eligibleRequests?.length ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <p>No tenés requerimientos elegibles disponibles.</p>
          <p className="text-xs mt-1">
            Los requerimientos deben estar pendientes, con entrega en depósito y
            material asignado.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {eligibleRequests.map((req) => (
            <div
              key={req.id}
              className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
              onClick={() => toggleRequest(req.id)}
            >
              <Checkbox
                checked={selected.includes(req.id)}
                onCheckedChange={() => toggleRequest(req.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  #{req.id.slice(0, 8)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString("es-AR")}
                  </span>
                </p>
                {req.raw_message && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {req.raw_message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {req.eligibleItemCount} ítem
                  {req.eligibleItemCount !== 1 ? "s" : ""} apto
                  {req.eligibleItemCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        disabled={!selected.length || isPending}
        onClick={handleSubmit}
        className="w-full"
      >
        {isPending
          ? "Agregando..."
          : `Agregar ${selected.length > 0 ? `${selected.length} ` : ""}requerimiento${selected.length !== 1 ? "s" : ""}`}
      </Button>
    </DialogContent>
  );
}
