interface AnilloAvanceProps {
  pctRecibido: number;
  pctComprometido: number;
  label?: string;
  size?: number;
}

export function AnilloAvance({
  pctRecibido,
  pctComprometido,
  label,
  size = 160,
}: AnilloAvanceProps) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const clamp = (v: number) => Math.min(Math.max(v, 0), 100);
  const recibido = clamp(pctRecibido);
  const comprometido = clamp(pctComprometido);

  const offsetComprometido = circumference - (comprometido / 100) * circumference;
  const offsetRecibido = circumference - (recibido / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/20"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offsetComprometido}
          strokeLinecap="round"
          className="text-green-300 transition-all duration-700"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offsetRecibido}
          strokeLinecap="round"
          className="text-green-600 transition-all duration-700"
        />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          className="rotate-90 origin-center fill-foreground text-2xl font-bold"
          style={{ fontSize: size * 0.16 }}
        >
          {Math.round(recibido)}%
        </text>
      </svg>
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600" /> Recibido
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-300" /> Comprometido
        </span>
      </div>
    </div>
  );
}
