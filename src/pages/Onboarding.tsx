import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, ArrowRight, Key, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "create" | "join";

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("create");
  const [loading, setLoading] = useState(false);

  // Create company
  const [companyName, setCompanyName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");

  // Join with code
  const [code, setCode] = useState("");

  // ── Create company ─────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const slug = companyName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 40) + "-" + Date.now();

    // Single atomic RPC: creates company, updates profile, assigns admin role
    const { error } = await supabase.rpc("onboard_create_company", {
      p_name:  companyName,
      p_slug:  slug,
      p_phone: companyPhone || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    toast({ title: "Empresa creada", description: `Bienvenido a ${companyName}. Ya sos el administrador.` });
    window.location.href = "/dashboard";
  };

  // ── Join with invite code ──────────────────────────────────────
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const cleanCode = code.trim().toUpperCase();

    // Single atomic RPC: validates code, updates profile, assigns role, marks code used
    const { error } = await supabase.rpc("onboard_join_with_code", {
      p_code: cleanCode,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    toast({ title: "Te uniste correctamente", description: "Ya tenés acceso a tu organización." });
    window.location.href = "/dashboard";
  };

  return (
    <div className="flex min-h-[100dvh]">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[42%] bg-zinc-950 flex-col justify-between p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(24 95% 53% / 0.15), transparent 65%)" }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            BuildBuy
          </span>
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">Paso 1 de 1</p>
            <h1
              className="text-4xl font-bold text-white leading-tight tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Configurá<br />
              tu <span className="text-primary">organización</span>
            </h1>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
            Creá tu empresa o unite a una existente con el código que te enviaron. Solo toma un minuto.
          </p>

          <div className="space-y-3 pt-2">
            {[
              { step: "1", text: "Creás o te unís a una empresa" },
              { step: "2", text: "El admin te asigna tu rol" },
              { step: "3", text: "Empezás a gestionar compras" },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-primary text-xs font-bold">{step}</span>
                </div>
                <span className="text-zinc-300 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-zinc-600 text-xs">
          © {new Date().getFullYear()} BuildBuy
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-[400px] space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              BuildBuy
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Configurá tu organización
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Hola{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name.split(" ")[0]}` : ""}. Necesitamos vincular tu cuenta a una empresa.
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl border border-border bg-muted/40 p-1 gap-1">
            {([
              { id: "create", label: "Crear empresa", icon: Plus },
              { id: "join", label: "Unirme con código", icon: Key },
            ] as { id: Tab; label: string; icon: typeof Plus }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  tab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Create company form */}
          {tab === "create" && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Nombre de la empresa</Label>
                <Input
                  id="company-name"
                  placeholder="Ej: Constructora San Martín"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-phone">
                  Teléfono <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  id="company-phone"
                  placeholder="+54 11 1234-5678"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Serás el administrador de esta empresa. Podrás invitar usuarios desde la sección Usuarios.
              </p>
              <Button type="submit" className="w-full gap-2" disabled={loading || !companyName.trim()}>
                {loading ? "Creando..." : <><span>Crear empresa</span><ArrowRight className="h-4 w-4" /></>}
              </Button>
            </form>
          )}

          {/* Join with code form */}
          {tab === "join" && (
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-code">Código de invitación</Label>
                <Input
                  id="invite-code"
                  placeholder="Ej: AB12CD34"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  autoFocus
                  className="font-mono tracking-widest text-center text-lg"
                  maxLength={12}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                El administrador de tu empresa te envió este código. Expira a los 7 días de su creación.
              </p>
              <Button type="submit" className="w-full gap-2" disabled={loading || code.trim().length < 4}>
                {loading ? "Validando..." : <><span>Unirme a la empresa</span><ArrowRight className="h-4 w-4" /></>}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
