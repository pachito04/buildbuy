import React from "react";
import { seedLanding, seedPlanFeatures } from "../seed";
import { Check, X, Sparkles } from "lucide-react";

export function PlanesScreen({ variant }: { variant: 'brutalist' | 'softhigh' | 'editorial' }) {
  return (
    <section className="bb-section" style={{ padding: variant === 'brutalist' ? '0 32px 80px' : '64px 24px 96px', maxWidth: 1240, margin: '0 auto' }}>
      {variant === 'brutalist' && <BrutalistHero />}
      {variant === 'softhigh' && <SoftHero />}
      {variant === 'editorial' && <EditorialHero />}

      {/* Plan cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: variant === 'brutalist' ? 0 : 24, marginBottom: 80, border: variant === 'brutalist' ? '1.5px solid var(--bb-fg)' : 'none' }}>
        <PlanColumn plan="bb" variant={variant} />
        <PlanColumn plan="bbplus" variant={variant} />
      </div>

      {/* Detailed comparison table */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: variant === 'brutalist' ? '1.5px solid var(--bb-fg)' : '1px solid var(--bb-bg-line)' }}>
        <h2 className="bb-section-title" style={{ marginBottom: 0 }}>{variant === 'editorial' ? <><em>Comparativa</em> completa</> : 'Comparativa completa'}</h2>
        <span data-eyebrow>tabla de features</span>
      </div>
      <ComparisonTable />
    </section>
  );
}

function BrutalistHero() {
  return (
    <div style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1.5px solid var(--bb-fg)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--bb-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
      <span>[ PLANES / 2 OPCIONES ]</span>
      <span data-mono>BB · BB+ — VIGENTE Q2 2026</span>
      <span>● COTIZAR</span>
    </div>
  );
}
function SoftHero() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 64 }}>
      <span data-eyebrow style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid var(--bb-card-line)', borderRadius: 9999, marginBottom: 24, background: 'var(--bb-card)' }}>
        Dos planes para distintas escalas
      </span>
      <h1 style={{ fontSize: 'clamp(40px, 5vw, 72px)', fontWeight: 600, letterSpacing: '-0.04em', maxWidth: '14ch', margin: '0 auto', lineHeight: 1.05 }}>
        Lo que necesitás hoy, lo que vas a necesitar mañana.
      </h1>
      <p style={{ fontSize: 17, color: 'var(--bb-fg-muted)', marginTop: 20, maxWidth: '56ch', margin: '20px auto 0' }}>
        BB acompaña constructoras y estudios. BB+ se conecta a tu ERP, te da data intelligence sobre la cadena y customer success dedicado.
      </p>
    </div>
  );
}
function EditorialHero() {
  return (
    <div style={{ borderTop: '2px solid var(--bb-fg)', padding: '48px 0 64px', textAlign: 'left' }}>
      <span data-eyebrow>Capítulo 03 · Planes</span>
      <h1 style={{ fontSize: 'clamp(48px, 6vw, 96px)', marginTop: 16, maxWidth: '20ch', lineHeight: 1 }}>
        <em>Dos</em> planes para distintas escalas.
      </h1>
    </div>
  );
}

function PlanColumn({ plan, variant }: { plan: 'bb' | 'bbplus'; variant: 'brutalist' | 'softhigh' | 'editorial' }) {
  const data = plan === 'bb' ? seedLanding.planBb : seedLanding.planBbPlus;
  const isPlus = plan === 'bbplus';
  const sep = variant === 'brutalist';

  return (
    <div style={{
      padding: 40,
      background: isPlus && variant !== 'editorial' ? 'var(--bb-fg)' : 'var(--bb-card)',
      color: isPlus && variant !== 'editorial' ? 'var(--bb-bg)' : 'var(--bb-fg)',
      border: sep ? 'none' : '1px solid var(--bb-card-line)',
      borderRight: sep && plan === 'bb' ? '1.5px solid var(--bb-fg)' : (sep ? 'none' : '1px solid var(--bb-card-line)'),
      borderRadius: sep ? 0 : 'var(--bb-radius-lg)',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span data-eyebrow style={{ color: isPlus && variant !== 'editorial' ? 'rgba(255,255,255,0.6)' : 'var(--bb-fg-muted)' }}>{data.tag}</span>
        {isPlus && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--bb-font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em',
            padding: '4px 10px',
            background: 'var(--bb-accent)', color: '#fff',
            borderRadius: variant === 'brutalist' ? 0 : 9999,
          }}>
            <Sparkles size={11} /> Recomendado para corporativas
          </span>
        )}
      </div>
      <h2 style={{ fontSize: variant === 'editorial' ? 64 : 48, marginBottom: 12, color: isPlus && variant === 'editorial' ? 'var(--bb-accent)' : 'inherit' }}>{data.name}</h2>
      <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 32, opacity: 0.85, maxWidth: '36ch' }}>{data.desc}</p>

      <div style={{ paddingTop: 24, borderTop: `1px solid ${isPlus && variant !== 'editorial' ? 'rgba(255,255,255,0.12)' : 'var(--bb-bg-line)'}`, marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--bb-font-display)', fontSize: 48, fontWeight: 600, lineHeight: 1 }}>
            {plan === 'bb' ? 'USD 290' : 'A medida'}
          </span>
          {plan === 'bb' && <span style={{ fontSize: 13, opacity: 0.6 }}>/ mes</span>}
        </div>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {plan === 'bb' ? 'facturación mensual o anual con 15% off' : 'según escala, integraciones y SLA'}
        </span>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'grid', gap: 12 }}>
        {data.bullets.map((b, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, fontSize: 14, alignItems: 'flex-start' }}>
            <Check size={16} style={{ marginTop: 3, color: isPlus && variant !== 'editorial' ? 'var(--bb-accent)' : 'var(--bb-accent)', flexShrink: 0 }} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button className={isPlus ? 'bb-btn-primary' : 'bb-btn-ghost'} style={{ width: '100%', justifyContent: 'center', display: 'flex' }}>
        {data.cta}
      </button>
    </div>
  );
}

function ComparisonTable() {
  return (
    <table className="bb-compare-table">
      <thead>
        <tr>
          <th>Feature</th>
          <th className="col-bb">BuildBuy</th>
          <th className="col-bbplus head">BuildBuy +</th>
        </tr>
      </thead>
      <tbody>
        {seedPlanFeatures.map(group => (
          <React.Fragment key={group.categoria}>
            <tr>
              <td colSpan={3} style={{
                fontFamily: 'var(--bb-font-mono)',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: 'var(--bb-fg-muted)',
                background: 'var(--bb-bg)',
                paddingTop: 24,
                paddingBottom: 12,
                fontWeight: 500,
              }}>{group.categoria}</td>
            </tr>
            {group.items.map((it, idx) => (
              <tr key={`${group.categoria}-${idx}`}>
                <td>{it.feature}</td>
                <td className="col-bb">{renderCell(it.bb)}</td>
                <td className="col-bbplus">{renderCell(it.bbplus)}</td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

function renderCell(value: boolean | string) {
  if (value === true) return <Check size={18} className="bb-check" style={{ display: 'inline-block' }} />;
  if (value === false) return <X size={18} className="bb-cross" style={{ display: 'inline-block' }} />;
  if (value === 'addon') return <span className="bb-addon">Add-on</span>;
  return <span style={{ fontFamily: 'var(--bb-font-mono)', fontSize: 12 }} data-mono>{value}</span>;
}
