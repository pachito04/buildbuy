import { seedInventario } from "../seed";
import { Search, ArrowDown, ArrowUp, AlertTriangle, Package } from "lucide-react";

type Estado = 'ok' | 'bajo' | 'critico';

function colorFor(estado: Estado) {
  switch (estado) {
    case 'critico': return 'var(--bb-danger)';
    case 'bajo': return 'var(--bb-warning)';
    case 'ok': return 'var(--bb-success)';
  }
}

function labelFor(estado: Estado) {
  switch (estado) {
    case 'critico': return 'Crítico';
    case 'bajo': return 'Bajo';
    case 'ok': return 'Disponible';
  }
}

export function InventarioScreen({ variant }: { variant: 'brutalist' | 'softhigh' | 'editorial' }) {
  return (
    <section className="bb-section" style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      {variant === 'brutalist' && <BrutalistInv />}
      {variant === 'softhigh' && <SoftHighInv />}
      {variant === 'editorial' && <EditorialInv />}
    </section>
  );
}

/* ─────────── A — Brutalist ─────────── */
function BrutalistInv() {
  const criticos = seedInventario.filter(i => i.estado === 'critico').length;
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      <div style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1.5px solid var(--bb-fg)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--bb-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
        <span>[ INVENTARIO / DEPOSITO CENTRAL ]</span>
        <span>{criticos > 0 && `${criticos} MATERIALES EN ESTADO CRITICO ●`}</span>
        <span data-mono>UNIT / D-01</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '40px 0 24px', borderBottom: '1.5px solid var(--bb-fg)' }}>
        <div>
          <div data-eyebrow style={{ marginBottom: 12 }}>[ STOCK · DEPOSITO ]</div>
          <h1 style={{ fontSize: 72 }}>Inventario</h1>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="bb-btn-ghost">&gt;&gt; Salida</button>
          <button className="bb-btn-primary">&gt;&gt; Entrada</button>
        </div>
      </div>

      {/* Filter strip */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1.5px solid var(--bb-fg)' }}>
        {['Todos · 06', 'Crítico · 02', 'Bajo · 01', 'OK · 03'].map((f, i) => (
          <button key={f} style={{ flex: 1, padding: '14px 16px', background: i === 0 ? 'var(--bb-fg)' : 'transparent', color: i === 0 ? 'var(--bb-bg)' : 'inherit', borderRight: i < 3 ? '1.5px solid var(--bb-fg)' : 'none', fontFamily: 'var(--bb-font-mono)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.14em', cursor: 'pointer' }}>{f}</button>
        ))}
      </div>

      {/* Inventario list */}
      {seedInventario.map((it, idx) => {
        const stockReal = it.stock - it.reservado;
        const pctRes = (it.reservado / Math.max(it.stock, 1)) * 100;
        const pctDisp = (stockReal / Math.max(it.stock, 1)) * 100;
        return (
          <div key={it.id} style={{ borderBottom: '1.5px solid var(--bb-fg)', padding: 24, display: 'grid', gridTemplateColumns: '4px 1.5fr 1fr 1.4fr 0.8fr', gap: 24, alignItems: 'center', background: idx === 0 || idx === 1 ? 'var(--bb-card)' : 'transparent' }}>
            <div style={{ width: 4, height: '100%', minHeight: 60, background: colorFor(it.estado as Estado) }} />
            <div>
              <div data-mono style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--bb-fg-muted)', marginBottom: 6 }}>MAT / {String(idx+1).padStart(3,'0')} · {it.proveedor.toUpperCase()}</div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{it.material}</div>
              <div style={{ fontSize: 12, color: 'var(--bb-fg-muted)', marginTop: 4, fontFamily: 'var(--bb-font-mono)' }}>Última entrada: {it.ultimaEntrada}</div>
            </div>
            <div>
              <div data-mono style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>Stock</div>
              <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 32, lineHeight: 1 }}>{it.stock}</div>
              <div data-mono style={{ fontSize: 11, marginTop: 4, color: 'var(--bb-fg-muted)' }}>min {it.minimo} · res {it.reservado} · disp {stockReal}</div>
            </div>
            <div>
              <div style={{ display: 'flex', height: 12, border: '1.5px solid var(--bb-fg)', position: 'relative' }}>
                <div style={{ width: `${pctRes}%`, background: 'var(--bb-warning)' }} />
                <div style={{ width: `${pctDisp}%`, background: colorFor(it.estado as Estado) }} />
                <div style={{ position: 'absolute', top: -4, height: 20, width: 2, background: 'var(--bb-fg)', left: `${(it.minimo / it.stock) * 100}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--bb-fg-muted)', marginTop: 6 }}>
                <span>RESERVADO</span><span>DISPONIBLE</span><span>MÍN</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span className="bb-pill" style={{ color: colorFor(it.estado as Estado), borderColor: colorFor(it.estado as Estado) }}>● {labelFor(it.estado as Estado)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────── B — Soft High ─────────── */
function SoftHighInv() {
  const criticos = seedInventario.filter(i => i.estado === 'critico').length;
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <span data-eyebrow style={{ marginBottom: 8, display: 'inline-block' }}>Stock</span>
          <h1 style={{ fontSize: 42, fontWeight: 600, letterSpacing: '-0.03em' }}>Inventario</h1>
          <p style={{ color: 'var(--bb-fg-muted)', marginTop: 8 }}>Depósito central · {seedInventario.length} materiales</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="bb-btn-ghost"><ArrowUp size={14} style={{ marginRight: 8 }} />Salida</button>
          <button className="bb-btn-primary">
            <ArrowDown size={14} />Entrada de stock <span data-trailing>+</span>
          </button>
        </div>
      </div>

      {criticos > 0 && (
        <div className="bb-card" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 20px', marginBottom: 24, borderColor: 'var(--bb-danger)', background: 'rgba(197, 58, 58, 0.04)' }}>
          <AlertTriangle size={18} color="var(--bb-danger)" />
          <span style={{ fontSize: 14 }}><strong>{criticos} materiales</strong> en estado crítico. Revisá las entradas pendientes con Acindar y Ormiflex.</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['Todos · 06', 'Crítico · 02', 'Bajo · 01', 'OK · 03'].map((f, i) => (
          <button key={f} className="bb-pill" style={{ padding: '8px 16px', cursor: 'pointer', background: i === 0 ? 'var(--bb-fg)' : 'var(--bb-card)', color: i === 0 ? '#fff' : 'inherit', borderColor: i === 0 ? 'var(--bb-fg)' : 'var(--bb-card-line)' }}>{f}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 9999, border: '1px solid var(--bb-card-line)', background: 'var(--bb-card)', color: 'var(--bb-fg-muted)', fontSize: 13 }}>
          <Search size={14} /> Buscar material…
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {seedInventario.map((it, idx) => {
          const stockReal = it.stock - it.reservado;
          const pctRes = (it.reservado / Math.max(it.stock, 1)) * 100;
          const pctDisp = (stockReal / Math.max(it.stock, 1)) * 100;
          const c = colorFor(it.estado as Estado);
          return (
            <div key={it.id} className="bb-card" style={{ padding: 20, display: 'grid', gridTemplateColumns: '6px 1.6fr 1fr 1.5fr 0.8fr', gap: 20, alignItems: 'center' }}>
              <div style={{ width: 6, height: 56, borderRadius: 9999, background: c }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Package size={14} color="var(--bb-fg-muted)" />
                  <span style={{ fontSize: 16, fontWeight: 500 }}>{it.material}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--bb-fg-muted)', marginTop: 6 }}>
                  {it.proveedor} · {it.ultimaEntrada}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--bb-fg-soft)', marginBottom: 4 }}>Stock total / disponible</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--bb-font-display)', fontSize: 24, fontWeight: 600 }}>{stockReal}</span>
                  <span data-mono style={{ fontSize: 12, color: 'var(--bb-fg-soft)' }}>/ {it.stock}</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', height: 8, borderRadius: 9999, overflow: 'hidden', position: 'relative', background: 'var(--bb-bg-line)' }}>
                  <div style={{ width: `${pctRes}%`, background: 'var(--bb-warning)' }} />
                  <div style={{ width: `${pctDisp}%`, background: c }} />
                  <div style={{ position: 'absolute', top: -3, height: 14, width: 2, borderRadius: 1, background: 'var(--bb-fg)', left: `${(it.minimo / it.stock) * 100}%`, opacity: 0.6 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--bb-fg-soft)', marginTop: 6, fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  <span>reservado {it.reservado}</span>
                  <span>disponible {stockReal}</span>
                  <span>mín {it.minimo}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="bb-pill" style={{ color: c, borderColor: c, background: 'transparent' }}>
                  <span className="bb-status-dot" style={{ background: c, marginRight: 6 }} />{labelFor(it.estado as Estado)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── C — Editorial ─────────── */
function EditorialInv() {
  const criticos = seedInventario.filter(i => i.estado === 'critico').length;
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      <div style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1px solid var(--bb-card-line)', padding: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--bb-fg-muted)' }}>
        <span>Inventario</span>
        <span>Depósito Central</span>
        <span>{seedInventario.length} materiales en stock</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48, padding: '56px 0', borderBottom: '1px solid var(--bb-card-line)' }}>
        <div>
          <span data-eyebrow>Stock vivo</span>
          <h1 style={{ fontSize: 80, marginTop: 16, marginBottom: 0 }}>
            <em>Inventario</em> al pulso del depósito.
          </h1>
        </div>
        <div style={{ paddingTop: 12 }}>
          <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24, maxWidth: '34ch' }}>
            {criticos > 0 ? (<><strong>{criticos} materiales</strong> en estado crítico. Acindar y Ormiflex tienen entradas demoradas.</>) : 'Todo en niveles operativos.'}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="bb-btn-primary">Entrada →</button>
            <button className="bb-btn-ghost">Salida</button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 56 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid var(--bb-fg)', paddingBottom: 16, marginBottom: 0 }}>
          <h2 style={{ fontSize: 32 }}><em>Materiales</em> en seguimiento</h2>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
            <span style={{ color: 'var(--bb-fg)' }}>Todos</span>
            <span style={{ color: 'var(--bb-fg-muted)' }}>Crítico</span>
            <span style={{ color: 'var(--bb-fg-muted)' }}>Bajo</span>
            <span style={{ color: 'var(--bb-fg-muted)' }}>OK</span>
          </div>
        </div>
        {seedInventario.map((it, idx) => {
          const stockReal = it.stock - it.reservado;
          const c = colorFor(it.estado as Estado);
          return (
            <article key={it.id} style={{ display: 'grid', gridTemplateColumns: '60px 2.4fr 1fr 1.4fr 0.9fr', gap: 24, padding: '28px 0', borderBottom: '1px solid var(--bb-card-line)', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 32, color: c }}>{String(idx+1).padStart(2,'0')}.</span>
              <div>
                <h3 style={{ fontSize: 22, marginBottom: 4, fontStyle: 'italic' }}>{it.material}</h3>
                <span data-eyebrow>{it.proveedor} · entrada {it.ultimaEntrada}</span>
              </div>
              <div>
                <span data-eyebrow>Disponible</span>
                <div style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 36, color: c, marginTop: 4 }}>{stockReal}</div>
                <span style={{ fontFamily: 'var(--bb-font-mono)', fontSize: 11, color: 'var(--bb-fg-muted)' }}>de {it.stock} · mín {it.minimo}</span>
              </div>
              <div>
                <div style={{ height: 1, background: 'var(--bb-card-line)', position: 'relative', marginTop: 16 }}>
                  <div style={{ position: 'absolute', inset: 0, height: 2, top: -0.5, width: `${(stockReal / it.stock) * 100}%`, background: c }} />
                  <div style={{ position: 'absolute', top: -4, height: 9, width: 1, background: 'var(--bb-fg)', left: `${(it.minimo / it.stock) * 100}%` }} />
                </div>
                <div data-mono style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--bb-fg-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>reservado {it.reservado}</span><span>mínimo</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="bb-pill" style={{ background: 'transparent', color: c, border: `1px solid ${c}` }}>{labelFor(it.estado as Estado)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
