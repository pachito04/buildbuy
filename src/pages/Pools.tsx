import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { CreatePoolDialog } from "@/components/pools/CreatePoolDialog";
import { PoolCard } from "@/components/pools/PoolCard";
import { Card, CardContent } from "@/components/ui/card";

export default function Pools() {
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: pools, isLoading } = useQuery({
    queryKey: ["pools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_pools")
        .select("*, pool_requests(*, requests:request_id(*, request_items(*))), pool_companies(*, companies:company_id(name))")
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
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile-company"],
    queryFn: async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return null;
      const { data } = await supabase.from("profiles").select("company_id").eq("id", u.id).single();
      return data;
    },
  });

  const createPool = useMutation({
    mutationFn: async ({ name, deadline, notes, isShared, invitedCompanyIds }: {
      name: string; deadline: string; notes: string; isShared: boolean; invitedCompanyIds: string[];
    }) => {
      const { data: pool, error } = await supabase.from("purchase_pools").insert({
        name,
        deadline: deadline || null,
        notes: notes || null,
        created_by: user?.id,
        company_id: profile?.company_id || null,
        is_shared: isShared,
      } as any).select().single();
      if (error) throw error;

      // Add creator's company
      if (profile?.company_id) {
        await supabase.from("pool_companies").insert({
          pool_id: (pool as any).id,
          company_id: profile.company_id,
        });
      }

      // Add invited companies
      if (isShared && invitedCompanyIds.length > 0) {
        const inserts = invitedCompanyIds
          .filter((cid) => cid !== profile?.company_id)
          .map((cid) => ({ pool_id: (pool as any).id, company_id: cid, status: "invited" }));
        if (inserts.length > 0) {
          const { error: e2 } = await supabase.from("pool_companies").insert(inserts);
          if (e2) throw e2;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      setCreateOpen(false);
      toast({ title: "Pool creado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addRequests = useMutation({
    mutationFn: async ({ poolId, requestIds }: { poolId: string; requestIds: string[] }) => {
      const inserts = requestIds.map((rid) => ({ pool_id: poolId, request_id: rid }));
      const { error } = await supabase.from("pool_requests").insert(inserts);
      if (error) throw error;
      const { error: e2 } = await supabase.from("requests").update({ status: "in_pool" }).in("id", requestIds);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: ["approved-requests"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      toast({ title: "Pedidos agregados al pool" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updatePoolStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("purchase_pools").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      toast({ title: "Estado del pool actualizado" });
    },
  });

  const inviteCompany = useMutation({
    mutationFn: async ({ poolId, companyId }: { poolId: string; companyId: string }) => {
      const { error } = await supabase.from("pool_companies").insert({
        pool_id: poolId,
        company_id: companyId,
        status: "invited",
      });
      if (error) throw error;
      // Mark pool as shared
      await supabase.from("purchase_pools").update({ is_shared: true } as any).eq("id", poolId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      toast({ title: "Empresa invitada al pool" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Pools de Compra</h1>
          <p className="text-muted-foreground text-sm mt-1">Consolidación de pedidos por volumen — propios o inter-empresa</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Crear Pool</Button>
          </DialogTrigger>
          <CreatePoolDialog
            companies={companies || []}
            userCompanyId={profile?.company_id || null}
            isPending={createPool.isPending}
            onSubmit={(data) => createPool.mutate(data)}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : !pools?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No hay pools creados.</p>
            <p className="text-xs mt-1">Crea un pool para consolidar pedidos y cotizar en volumen.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pools.map((pool) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              approvedRequests={approvedRequests || []}
              companies={companies || []}
              userCompanyId={profile?.company_id || null}
              onAddRequests={(poolId, requestIds) => addRequests.mutate({ poolId, requestIds })}
              onUpdateStatus={(id, status) => updatePoolStatus.mutate({ id, status })}
              onInviteCompany={(poolId, companyId) => inviteCompany.mutate({ poolId, companyId })}
              addRequestsPending={addRequests.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
