import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { CreatePoolDialog } from "@/components/pools/CreatePoolDialog";
import { PoolCard } from "@/components/pools/PoolCard";
import { Card, CardContent } from "@/components/ui/card";
import { deriveLinkedCompanies } from "@/lib/pool-invite-utils";
import { buildPoolStatePayload } from "@/pages/pools-helpers";

export default function Pools() {
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  const { data: pools, isLoading } = useQuery({
    queryKey: ["pools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_pools")
        .select(
          "*, pool_state, pool_requests(request_id), pool_companies(*, companies:company_id(name))"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: approvedRequests } = useQuery({
    queryKey: ["approved-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("*, request_items(*)")
        .eq("status", "pendiente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile-company"],
    queryFn: async () => {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (!u) return null;
      const { data } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", u.id)
        .single();
      return data;
    },
  });

  // Use companyId from useViewRole (already reactive to auth state).
  // Fall back to the profile query for the createPool mutation which needs the company_id at mutation time.
  // IMPORTANT: declare effectiveCompanyId BEFORE any query that uses it in queryKey (TDZ guard).
  const effectiveCompanyId = companyId ?? profile?.company_id ?? null;

  // GAP1: fetch company_links (active only) so we can derive the actively-linked subset.
  // This replaces the previous "all companies" query — only linked companies are invitable.
  const { data: companyLinks } = useQuery({
    queryKey: ["company-links-for-pools", effectiveCompanyId],
    enabled: !!effectiveCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_links")
        .select(
          `requester_company_id,
           target_company_id,
           status,
           requester:companies!company_links_requester_company_id_fkey(id, name),
           target:companies!company_links_target_company_id_fkey(id, name)`
        )
        .eq("status", "active");
      if (error) throw error;
      return data ?? [];
    },
  });

  // GAP1: derive the set of actively-linked companies from company_links rows.
  // Only these companies may be invited to a pool (UI defense; DB trigger is the hard guard).
  const linkedCompanies = effectiveCompanyId
    ? deriveLinkedCompanies(
        (companyLinks ?? []) as Parameters<typeof deriveLinkedCompanies>[0],
        effectiveCompanyId
      )
    : [];

  const createPool = useMutation({
    mutationFn: async ({
      name,
      deadline,
      notes,
      isShared,
      invitedCompanyIds,
    }: {
      name: string;
      deadline: string;
      notes: string;
      isShared: boolean;
      invitedCompanyIds: string[];
    }) => {
      const { data: pool, error } = await supabase
        .from("purchase_pools")
        .insert({
          name,
          deadline: deadline || null,
          notes: notes || null,
          created_by: user?.id,
          company_id: effectiveCompanyId || null,
          is_shared: isShared,
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Add creator's company to pool_companies.
      if (effectiveCompanyId) {
        await supabase.from("pool_companies").insert({
          pool_id: (pool as any).id,
          company_id: effectiveCompanyId,
        });
      }

      // Add invited companies.
      if (isShared && invitedCompanyIds.length > 0) {
        const inserts = invitedCompanyIds
          .filter((cid) => cid !== effectiveCompanyId)
          .map((cid) => ({
            pool_id: (pool as any).id,
            company_id: cid,
            status: "invited",
          }));
        if (inserts.length > 0) {
          const { error: e2 } = await supabase
            .from("pool_companies")
            .insert(inserts);
          if (e2) throw e2;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      setCreateOpen(false);
      toast({ title: "Pool creado" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addRequests = useMutation({
    mutationFn: async ({
      poolId,
      requestIds,
    }: {
      poolId: string;
      requestIds: string[];
    }) => {
      const inserts = requestIds.map((rid) => ({
        pool_id: poolId,
        request_id: rid,
      }));
      const { error } = await supabase.from("pool_requests").insert(inserts);
      if (error) throw error;
      // NOTE: intentionally NOT writing requests.status='in_pool'.
      // Pool membership is tracked by pool_requests rows, not a request status field.
      // 'in_pool' is absent from the request_status enum and would cause a DB error (AD-6).
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: ["approved-requests"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      toast({ title: "Pedidos agregados al pool" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updatePoolStatus = useMutation({
    // GAP4: writes pool_state (not legacy status). buildPoolStatePayload enforces this.
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("purchase_pools")
        .update(buildPoolStatePayload(status) as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      toast({ title: "Estado del pool actualizado" });
    },
  });

  const inviteCompany = useMutation({
    mutationFn: async ({
      poolId,
      companyId: cid,
    }: {
      poolId: string;
      companyId: string;
    }) => {
      const { error } = await supabase.from("pool_companies").insert({
        pool_id: poolId,
        company_id: cid,
        status: "invited",
      });
      if (error) throw error;
      // Mark pool as shared.
      await supabase
        .from("purchase_pools")
        .update({ is_shared: true } as any)
        .eq("id", poolId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      toast({ title: "Empresa invitada al pool" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Pools de Compra</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Consolidación de pedidos por volumen — propios o inter-empresa
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Crear Pool
            </Button>
          </DialogTrigger>
          <CreatePoolDialog
            linkedCompanies={linkedCompanies}
            userCompanyId={effectiveCompanyId}
            isPending={createPool.isPending}
            onSubmit={(data) => createPool.mutate(data)}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !pools?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No hay pools creados.</p>
            <p className="text-xs mt-1">
              Crea un pool para consolidar pedidos y cotizar en volumen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pools.map((pool) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              approvedRequests={approvedRequests || []}
              companies={linkedCompanies}
              userCompanyId={effectiveCompanyId}
              onAddRequests={(poolId, requestIds) =>
                addRequests.mutate({ poolId, requestIds })
              }
              onUpdateStatus={(id, status) =>
                updatePoolStatus.mutate({ id, status })
              }
              onInviteCompany={(poolId, cid) =>
                inviteCompany.mutate({ poolId, companyId: cid })
              }
              addRequestsPending={addRequests.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
