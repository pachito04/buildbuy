import { seedKanban } from "../seed";
import { Clock, User, MoreVertical, ArrowRight } from "lucide-react";

type ColKey = 'pendiente' | 'enCurso' | 'recibido' | 'rechazado';

const COL_META: Record<ColKey, { title: string; color: string; sub: string }> = {
  pendiente: { title: 'Pendiente', color: 'var(--bb-warning)', sub: 'esperando proceso' },
  enCurso: { title: 'En curso', color: 'var(--bb-accent)', sub: 'parcialmente procesado' },
  recibido: { title: 'Recibido', color: 'var(--bb-success)', sub: 'cerrado' },
  rechazado: { title: 'Rechazado', color: 'var(--bb-danger)', sub: 'requiere revisión' },
};

export function KanbanScreen({ variant }: { variant: 'brutalist' | 'softhigh' | 'editorial' }) {
  return (
    <section className="bb-section" style={{ padding: 32, maxWidth: 1500, margin: '0 auto' }}>
      {variant === 'brutalist' && <BrutalistKanban />}
      {variant === 'softhigh' && <SoftHighKanban />}
      {variant === 'editorial' && <EditorialKanban />}
    </section>
  );
}

function totalCount() {
  return seedKanban.pendiente.length + seedKanban.enCurso.length + seedKanban.recibido.length + seedKanban.rechazado.length;
}

/* ─────────── A — Brutalist ─────────── */
function BrutalistKanban() {
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      <div style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1.5px solid var(--bb-fg)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--bb-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
        <span>[ REQUERIMIENTOS / KANBAN ]</span>
        <span data-mono>{totalCount()} REQ. EN CIRCUITO</span>
        <span>VISTA / BOARD</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '40px 0 24px', borderBottom: '1.5px solid var(--bb-fg)' }}>
        <div>
          <div data-eyebrow style={{ marginBottom: 12 }}>[ CIRCUITO COMPRAS · KANBAN ]</div>
          <h1 style={{ fontSize: 72 }}>Requerimientos</h1>
        </div>
        <button className="bb-btn-primary">&gt;&gt; Nuevo requerimiento</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginTop: 24, border: '1.5px solid var(--bb-fg)' }}>
        {(Object.keys(seedKanban) as ColKey[]).map((col, i) => (
          <div key={col} style={{ borderRight: i < 3 ? '1.5px solid var(--bb-fg)' : 'none', minHeight: 480 }}>
            <div style={{ borderBottom: '1.5px solid var(--bb-fg)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bb-bg-elev)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, background: COL_META[col].color }} />
                <span data-mono style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700 }}>{COL_META[col].title}</span>
              </div>
              <span data-mono style={{ fontSize: 11 }}>0{seedKanban[col].length}</span>
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 12 }}>
              {seedKanban[col].map(r => (
                <div key={r.id} className="bb-card" style={{ padding: 16, borderLeft: `4px solid ${COL_META[col].color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontFamily: 'var(--bb-font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    <span style={{ fontWeight: 700 }}>{r.codigo}</span>
                    <span style={{ color: r.dias > 7 ? 'var(--bb-danger)' : 'var(--bb-fg-muted)' }}>{r.dias}d</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{r.obra}</div>
                  <div style={{ fontSize: 12, color: 'var(--bb-fg-muted)', fontFamily: 'var(--bb-font-mono)', marginBottom: 12 }}>
                    {r.items} ítems · {r.autor.toUpperCase()}
                  </div>
                  {'progreso' in r && (
                    <div style={{ height: 4, background: 'var(--bb-bg-line)', position: 'relative' }}>
                      <div style={{ position: 'absolute', inset: 0, width: `${r.progreso}%`, background: COL_META[col].color }} />
                    </div>
                  )}
                  {'motivo' in r && (
                    <div data-mono style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--bb-danger)', marginTop: 8 }}>
                      // {r.motivo}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────── B — Soft High ─────────── */
function SoftHighKanban() {
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <span data-eyebrow style={{ marginBottom: 8, display: 'inline-block' }}>Compras</span>
          <h1 style={{ fontSize: 42, fontWeight: 600, letterSpacing: '-0.03em' }}>Requerimientos</h1>
          <p style={{ color: 'var(--bb-fg-muted)', marginTop: 8 }}>{totalCount()} solicitudes en circuito · 4 obras</p>
        </div>
        <button className="bb-btn-primary">
          Nuevo requerimiento <span data-trailing><ArrowRight size={14} /></span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {(Object.keys(seedKanban) as ColKey[]).map(col => (
          <div key={col} style={{ background: 'var(--bb-bg-elev)', border: '1px solid var(--bb-card-line)', borderRadius: 'var(--bb-radius-lg)', padding: 16, minHeight: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--bb-card-line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 9999, background: COL_META[col].color }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{COL_META[col].title}</div>
                  <div style={{ fontSize: 11, color: 'var(--bb-fg-muted)' }}>{COL_META[col].sub}</div>
                </div>
              </div>
              <span style={{ fontFamily: 'var(--bb-font-mono)', fontSize: 12, color: 'var(--bb-fg-muted)' }}>{seedKanban[col].length}</span>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {seedKanban[col].map(r => (
                <div key={r.id} className="bb-card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span data-mono style={{ fontSize: 11, color: 'var(--bb-fg-muted)', letterSpacing: '0.06em' }}>{r.codigo}</span>
                    <MoreVertical size={14} color="var(--bb-fg-soft)" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{r.obra}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--bb-fg-muted)', marginBottom: 'progreso' in r ? 12 : 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} /> {r.autor}</span>
                    <span>·</span>
                    <span>{r.items} ítems</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: r.dias > 7 ? 'var(--bb-danger)' : 'var(--bb-fg-muted)' }}><Clock size={11} /> {r.dias}d</span>
                  </div>
                  {'progreso' in r && (
                    <div className="bb-progress">
                      <div className="bb-progress-fill" style={{ width: `${r.progreso}%` }} />
                    </div>
                  )}
                  {'motivo' in r && (
                    <div style={{ fontSize: 11, color: 'var(--bb-danger)', marginTop: 8, padding: '6px 10px', background: 'rgba(197, 58, 58, 0.06)', borderRadius: 'var(--bb-radius-sm)' }}>
                      {r.motivo}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────── C — Editorial ─────────── */
function EditorialKanban() {
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      <div style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1px solid var(--bb-card-line)', padding: '16px 0', display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--bb-fg-muted)' }}>
        <span>Requerimientos</span>
        <span>Circuito de compras</span>
        <span>{totalCount()} solicitudes en circuito</span>
      </div>

      <div style={{ padding: '48px 0', borderBottom: '2px solid var(--bb-fg)' }}>
        <span data-eyebrow>Compras</span>
        <h1 style={{ fontSize: 88, marginTop: 16, marginBottom: 0 }}>
          El <em>circuito</em> de requerimientos.
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 32 }}>
        {(Object.keys(seedKanban) as ColKey[]).map((col, idx) => (
          <div key={col}>
            <div style={{ borderTop: `2px solid ${COL_META[col].color}`, paddingTop: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ fontSize: 24 }}><em>{COL_META[col].title}</em></h3>
                <span style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 24, color: COL_META[col].color }}>{String(seedKanban[col].length).padStart(2,'0')}</span>
              </div>
              <span data-eyebrow>{COL_META[col].sub}</span>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {seedKanban[col].map(r => (
                <article key={r.id} className="bb-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                    <span data-eyebrow>{r.codigo}</span>
                    <span data-mono style={{ fontSize: 11, color: r.dias > 7 ? 'var(--bb-danger)' : 'var(--bb-fg-muted)' }}>+{r.dias}d</span>
                  </div>
                  <h4 style={{ fontSize: 18, marginBottom: 8 }}>{r.obra}</h4>
                  <div style={{ fontSize: 12, color: 'var(--bb-fg-muted)', fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {r.items} ítems · {r.autor}
                  </div>
                  {'progreso' in r && (
                    <div style={{ marginTop: 12, height: 1, background: 'var(--bb-card-line)', position: 'relative' }}>
                      <div style={{ position: 'absolute', inset: 0, height: 2, top: -0.5, width: `${r.progreso}%`, background: COL_META[col].color }} />
                    </div>
                  )}
                  {'motivo' in r && (
                    <p style={{ fontSize: 12, fontStyle: 'italic', marginTop: 10, color: 'var(--bb-danger)' }}>«{r.motivo}»</p>
                  )}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
