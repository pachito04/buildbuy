import { seedKpis, seedAvanceObras } from "../seed";
import { ArrowUpRight, Bell, MoreHorizontal, TrendingUp, TrendingDown } from "lucide-react";

export function DashboardScreen({ variant }: { variant: 'brutalist' | 'softhigh' | 'editorial' }) {
  return (
    <section className="bb-section" style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
      {variant === 'brutalist' && <BrutalistDash />}
      {variant === 'softhigh' && <SoftHighDash />}
      {variant === 'editorial' && <EditorialDash />}
    </section>
  );
}

/* ─────────── A — Brutalist ─────────── */
function BrutalistDash() {
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      <div style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1.5px solid var(--bb-fg)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--bb-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
        <span>[ DASHBOARD / COMPRAS ]</span>
        <span data-mono>USR / M.VIVANCO · UNIDAD CABALLITO-2400</span>
        <span>● ONLINE</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '40px 0 24px', borderBottom: '1.5px solid var(--bb-fg)' }}>
        <div>
          <div data-eyebrow style={{ marginBottom: 12 }}>[ VISTA GENERAL · 15 MAY 2026 ]</div>
          <h1 style={{ fontSize: 72 }}>Operaciones</h1>
        </div>
        <button className="bb-btn-primary">&gt;&gt; Nuevo requerimiento</button>
      </div>

      {/* KPI grid — 4 columns, no rounded corners, hairline dividers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: '1.5px solid var(--bb-fg)', borderTop: 'none' }}>
        {seedKpis.map((k, i) => (
          <div key={k.id} style={{ padding: 28, borderRight: i < 3 ? '1.5px solid var(--bb-fg)' : 'none' }}>
            <div data-mono style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--bb-fg-muted)', marginBottom: 16 }}>{`+ KPI / 0${i+1}`}</div>
            <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 52, lineHeight: 0.95, marginBottom: 8 }}>{k.value}</div>
            <div style={{ fontSize: 13, marginBottom: 12 }}>{k.label}</div>
            <div style={{ display: 'inline-block', padding: '2px 8px', border: `1.5px solid ${k.deltaPositive ? 'var(--bb-success)' : 'var(--bb-danger)'}`, color: k.deltaPositive ? 'var(--bb-success)' : 'var(--bb-danger)', fontFamily: 'var(--bb-font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {k.deltaPositive ? '▲' : '▼'} {k.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Obras table */}
      <div style={{ marginTop: 56 }}>
        <div data-eyebrow style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid var(--bb-fg)', paddingBottom: 12, marginBottom: 0 }}>
          <span>[ OBRAS / ACTIVAS ]</span>
          <span data-mono>04 / 14 — orden por avance %</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--bb-font-body)' }}>
          <thead>
            <tr style={{ fontFamily: 'var(--bb-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--bb-fg-muted)' }}>
              <th style={{ textAlign: 'left', padding: '14px 12px', borderBottom: '1.5px solid var(--bb-fg)' }}>Obra · Cliente</th>
              <th style={{ textAlign: 'right', padding: '14px 12px', borderBottom: '1.5px solid var(--bb-fg)' }}>Presupuesto</th>
              <th style={{ textAlign: 'right', padding: '14px 12px', borderBottom: '1.5px solid var(--bb-fg)' }}>Deadline</th>
              <th style={{ textAlign: 'right', padding: '14px 12px', borderBottom: '1.5px solid var(--bb-fg)', minWidth: 280 }}>Avance</th>
            </tr>
          </thead>
          <tbody>
            {seedAvanceObras.map(o => (
              <tr key={o.id} style={{ borderBottom: '1px solid var(--bb-bg-line)' }}>
                <td style={{ padding: '18px 12px' }}>
                  <div style={{ fontWeight: 600 }}>{o.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--bb-fg-muted)', fontFamily: 'var(--bb-font-mono)', marginTop: 2 }}>{o.cliente}</div>
                </td>
                <td data-mono style={{ padding: '18px 12px', textAlign: 'right', fontWeight: 500 }}>{o.presupuesto}</td>
                <td data-mono style={{ padding: '18px 12px', textAlign: 'right', color: 'var(--bb-fg-muted)' }}>{o.deadline}</td>
                <td style={{ padding: '18px 12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
                    <div data-mono style={{ width: 50, textAlign: 'right' }}>{o.avance}%</div>
                    <div style={{ width: 160, height: 4, background: 'var(--bb-bg-line)', position: 'relative' }}>
                      <div style={{ position: 'absolute', inset: 0, width: `${o.avance}%`, background: 'var(--bb-accent)' }} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────── B — Soft High ─────────── */
function SoftHighDash() {
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40 }}>
        <div>
          <span data-eyebrow style={{ marginBottom: 8, display: 'inline-block' }}>Dashboard</span>
          <h1 style={{ fontSize: 48, fontWeight: 600, letterSpacing: '-0.03em' }}>Buenas, Mariano.</h1>
          <p style={{ color: 'var(--bb-fg-muted)', marginTop: 8 }}>4 obras necesitan tu atención hoy.</p>
        </div>
        <button className="bb-btn-primary">
          Nuevo requerimiento <span data-trailing><ArrowUpRight size={14} /></span>
        </button>
      </div>

      {/* Bento KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {seedKpis.map((k, i) => (
          <div key={k.id} className="bb-card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <span style={{ fontSize: 13, color: 'var(--bb-fg-muted)' }}>{k.label}</span>
              <MoreHorizontal size={16} color="var(--bb-fg-soft)" />
            </div>
            <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 42, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1 }}>{k.value}</div>
            <div style={{ marginTop: 12, fontSize: 12, color: k.deltaPositive ? 'var(--bb-success)' : 'var(--bb-danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {k.deltaPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />} <span>{k.delta}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Doppelrand obras card */}
      <div className="bb-card-tray">
        <div className="bb-card-inner" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bb-card-line)' }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Obras activas</h2>
              <p style={{ fontSize: 13, color: 'var(--bb-fg-muted)', marginTop: 4 }}>Ordenadas por avance</p>
            </div>
            <button className="bb-btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>Ver todas</button>
          </div>
          <div>
            {seedAvanceObras.map((o, idx) => (
              <div key={o.id} style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.6fr', gap: 24, alignItems: 'center', borderBottom: idx < seedAvanceObras.length - 1 ? '1px solid var(--bb-card-line)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 15 }}>{o.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--bb-fg-muted)', marginTop: 2 }}>{o.cliente}</div>
                </div>
                <div data-mono style={{ fontSize: 13, color: 'var(--bb-fg-muted)' }}>{o.presupuesto}</div>
                <div data-mono style={{ fontSize: 13, color: 'var(--bb-fg-muted)' }}>{o.deadline}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="bb-progress" style={{ flex: 1 }}>
                    <div className="bb-progress-fill" style={{ width: `${o.avance}%` }} />
                  </div>
                  <span data-mono style={{ width: 44, fontSize: 13, textAlign: 'right' }}>{o.avance}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── C — Editorial ─────────── */
function EditorialDash() {
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      <div style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1px solid var(--bb-card-line)', padding: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--bb-fg-muted)' }}>
        <span>Dashboard</span>
        <span>Viernes, 15 de mayo · 2026</span>
        <span>Sesión Mariano Vivanco</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48, padding: '56px 0', borderBottom: '1px solid var(--bb-card-line)' }}>
        <div>
          <span data-eyebrow>Vista general</span>
          <h1 style={{ fontSize: 88, marginTop: 16, marginBottom: 0 }}>
            <em>Operaciones</em> al cierre de la semana.
          </h1>
        </div>
        <div style={{ paddingTop: 12 }}>
          <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>
            Cuatro obras necesitan tu atención hoy: tres tienen requerimientos atrasados y una está a 72% del cronograma con dos cotizaciones por adjudicar.
          </p>
          <button className="bb-btn-primary">Nuevo requerimiento →</button>
        </div>
      </div>

      {/* Editorial KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderBottom: '1px solid var(--bb-card-line)' }}>
        {seedKpis.map((k, i) => (
          <div key={k.id} style={{ padding: '40px 24px', borderLeft: i > 0 ? '1px solid var(--bb-card-line)' : 'none' }}>
            <span data-eyebrow>{k.label}</span>
            <div style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 64, color: 'var(--bb-accent)', marginTop: 16, lineHeight: 1 }}>{k.value}</div>
            <div style={{ marginTop: 16, fontSize: 13, color: k.deltaPositive ? 'var(--bb-success)' : 'var(--bb-danger)' }}>
              {k.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Editorial obras list */}
      <div style={{ marginTop: 56 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid var(--bb-fg)', paddingBottom: 16, marginBottom: 32 }}>
          <h2 style={{ fontSize: 40 }}><em>Obras</em> activas</h2>
          <span data-eyebrow>04 de 14</span>
        </div>
        {seedAvanceObras.map((o, i) => (
          <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '60px 2.4fr 1fr 1fr 1.5fr', gap: 24, padding: '24px 0', borderBottom: '1px solid var(--bb-card-line)', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 32, color: 'var(--bb-accent)' }}>{String(i+1).padStart(2,'0')}.</span>
            <div>
              <h3 style={{ fontSize: 22, marginBottom: 4 }}>{o.nombre}</h3>
              <span data-eyebrow>{o.cliente}</span>
            </div>
            <span data-mono style={{ fontSize: 13, color: 'var(--bb-fg-muted)' }}>{o.presupuesto}</span>
            <span data-mono style={{ fontSize: 13, color: 'var(--bb-fg-muted)' }}>Entrega {o.deadline}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--bb-card-line)', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, height: 2, top: -0.5, width: `${o.avance}%`, background: 'var(--bb-accent)' }} />
              </div>
              <span style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 22, color: 'var(--bb-accent)', minWidth: 56, textAlign: 'right' }}>{o.avance}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
