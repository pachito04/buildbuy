import { Badge } from "@/components/ui/badge";

type PoolState =
  | "borrador"
  | "confirmado"
  | "en_comparativa"
  | "adjudicado"
  | "cerrado"
  | "cancelado"
  | (string & {});

interface StateConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
}

const STATE_CONFIG: Record<string, StateConfig> = {
  borrador: {
    label: "Borrador",
    variant: "outline",
    className: "border-zinc-300 text-zinc-600",
  },
  confirmado: {
    label: "Confirmado",
    variant: "default",
    className: "bg-emerald-600 text-white border-emerald-600",
  },
  en_comparativa: {
    label: "En Comparativa",
    variant: "default",
    className: "bg-blue-600 text-white border-blue-600",
  },
  adjudicado: {
    label: "Adjudicado",
    variant: "default",
    className: "bg-amber-600 text-white border-amber-600",
  },
  cerrado: {
    label: "Cerrado",
    variant: "secondary",
    className: "",
  },
  cancelado: {
    label: "Cancelado",
    variant: "destructive",
    className: "",
  },
};

interface Props {
  state: PoolState;
}

export function PoolStateBadge({ state }: Props) {
  const config = STATE_CONFIG[state] ?? {
    label: state,
    variant: "secondary" as const,
    className: "",
  };

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
