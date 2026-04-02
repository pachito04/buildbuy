import { useState } from "react";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  companies: { id: string; name: string }[];
  userCompanyId: string | null;
  isPending: boolean;
  onSubmit: (data: {
    name: string;
    deadline: string;
    notes: string;
    isShared: boolean;
    invitedCompanyIds: string[];
  }) => void;
}

export function CreatePoolDialog({ companies, userCompanyId, isPending, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

  const otherCompanies = companies.filter((c) => c.id !== userCompanyId);

  const toggleCompany = (id: string) => {
    setSelectedCompanies((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, deadline, notes, isShared, invitedCompanyIds: selectedCompanies });
    setName("");
    setDeadline("");
    setNotes("");
    setIsShared(false);
    setSelectedCompanies([]);
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

        {/* Company selection */}
        {isShared && (
          <div className="space-y-2">
            <Label>Invitar empresas</Label>
            {otherCompanies.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay otras empresas registradas para invitar.
              </p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {otherCompanies.map((c) => (
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
