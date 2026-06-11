import { useState } from "react";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  /**
   * Companies that are actively linked to the current user's company.
   * The caller (Pools.tsx) is responsible for deriving this list from
   * company_links rows using deriveLinkedCompanies() — GAP1 filter.
   */
  linkedCompanies: { id: string; name: string }[];
  userCompanyId: string | null;
  isPending: boolean;
  onSubmit: (data: {
    name: string;
    deadline: string;
    notes: string;
    isShared: boolean;
    invitedCompanyIds: string[];
    awardMode: "leader" | "per_company";
  }) => void;
}

export function CreatePoolDialog({ linkedCompanies, userCompanyId, isPending, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [awardMode, setAwardMode] = useState<"leader" | "per_company">("leader");

  // linkedCompanies is already filtered to active links by the parent (GAP1).
  const invitableCompanies = linkedCompanies;

  const toggleCompany = (id: string) => {
    setSelectedCompanies((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, deadline, notes, isShared, invitedCompanyIds: selectedCompanies, awardMode });
    setName("");
    setDeadline("");
    setNotes("");
    setIsShared(false);
    setSelectedCompanies([]);
    setAwardMode("leader");
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuevo Pool de Compra</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Nombre del pool *</Label>
          <Input
            placeholder="Ej: Pool Acero Marzo 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Fecha límite</Label>
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Inter-company toggle */}
        <div className="flex items-center justify-between border rounded-lg p-3">
          <div>
            <p className="text-sm font-medium">Pool Inter-Empresa</p>
            <p className="text-xs text-muted-foreground">
              Permitir que otras constructoras participen en este pool
            </p>
          </div>
          <Switch checked={isShared} onCheckedChange={setIsShared} />
        </div>

        {/* Award mode selector (GAP2) */}
        <div className="space-y-2">
          <Label>Modo de adjudicación</Label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 text-sm px-3 py-2 rounded-lg border transition-colors ${
                awardMode === "leader"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
              onClick={() => setAwardMode("leader")}
            >
              Líder adjudica todo
            </button>
            <button
              type="button"
              className={`flex-1 text-sm px-3 py-2 rounded-lg border transition-colors ${
                awardMode === "per_company"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
              onClick={() => setAwardMode("per_company")}
            >
              Adjudicación por empresa
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {awardMode === "leader"
              ? "Un líder elige la cotización ganadora para todos."
              : "Cada empresa elige su proveedor ganador por ítem."}
          </p>
        </div>

        {/* Company selection — only actively-linked companies (GAP1) */}
        {isShared && (
          <div className="space-y-2">
            <Label>Invitar empresas</Label>
            {invitableCompanies.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tenés empresas vinculadas. Creá un vínculo activo primero.
              </p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {invitableCompanies.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-2 border rounded-lg">
                    <Checkbox
                      checked={selectedCompanies.includes(c.id)}
                      onCheckedChange={() => toggleCompany(c.id)}
                    />
                    <span className="text-sm">{c.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Creando..." : "Crear Pool"}
        </Button>
      </form>
    </DialogContent>
  );
}
