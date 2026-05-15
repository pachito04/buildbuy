import { useState } from "react";
import "./variants.css";
import { LandingHero } from "./screens/LandingHero";
import { LandingSections } from "./screens/LandingSections";
import { DemoFlow } from "./screens/Demo";
import { PlanesScreen } from "./screens/Planes";

type Variant = 'brutalist' | 'softhigh' | 'editorial';
type Section = 'landing' | 'demo' | 'planes';

const VARIANTS: { id: Variant; tag: string; mood: string }[] = [
  { id: 'brutalist', tag: 'Swiss print × Tactical',  mood: 'Concreto + acero + naranja como hazard red. Grids visibles, ASCII framing, 90°.' },
  { id: 'softhigh',  tag: 'Linear / Vercel core',     mood: 'Minimal premium. Doppelrand cards, Geist, naranja desaturado, macro-whitespace.' },
  { id: 'editorial', tag: 'Wallpaper × Construction', mood: 'Cream cálido, serif itálico, grain, naranja burnt. Vibe revista de arquitectura.' },
];

const SECTIONS: { id: Section; label: string; sub: string }[] = [
  { id: 'landing', label: 'Landing pública',   sub: 'hero · cómo funciona · roles · casos · FAQ' },
  { id: 'demo',    label: 'Demo interactiva',  sub: 'sidebar · perfil switcher · tour · paywalls' },
  { id: 'planes',  label: 'BB vs BB +',        sub: 'comparativa de planes' },
];

export default function DesignPreview() {
  const [variant, setVariant] = useState<Variant>('brutalist');
  const [section, setSection] = useState<Section>('landing');

  return (
    <div style={{ minHeight: '100dvh' }}>
      <PreviewToolbar variant={variant} section={section} onVariant={setVariant} onSection={setSection} />
      <div className={`bb-preview bb-preview--${variant}`}>
        {section === 'landing' && (<>
          <LandingHero variant={variant} />
          <LandingSections variant={variant} />
        </>)}
        {section === 'demo'   && <DemoFlow variant={variant} />}
        {section === 'planes' && <PlanesScreen variant={variant} />}
      </div>
    </div>
  );
}

function PreviewToolbar({
  variant, section, onVariant, onSection,
}: {
  variant: Variant; section: Section;
  onVariant: (v: Variant) => void; onSection: (s: Section) => void;
}) {
  const current = VARIANTS.find(v => v.id === variant)!;
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: '#0F0F0F', color: '#E8E6E0',
      borderBottom: '1px solid #2A2926',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system',
      fontSize: 13,
    }}>
      {/* Brand + mood */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '12px 20px', borderBottom: '1px solid #2A2926', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>BuildBuy<span style={{ color: '#E55D1F' }}>·</span>Design Preview</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1F1F1B', color: '#9E9C95', textTransform: 'uppercase', letterSpacing: '0.12em' }}>v2 · draft</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9E9C95', maxWidth: 560 }}>{current.mood}</span>
      </div>

      {/* Variant selector */}
      <div style={{ display: 'flex', gap: 0, padding: '0 20px', alignItems: 'stretch', borderBottom: '1px solid #2A2926' }}>
        <span style={{ alignSelf: 'center', fontSize: 11, color: '#6E6C66', textTransform: 'uppercase', letterSpacing: '0.16em', marginRight: 16 }}>Variante</span>
        {VARIANTS.map(v => {
          const code = v.id === 'brutalist' ? 'A' : v.id === 'softhigh' ? 'B' : 'C';
          const name = v.id === 'brutalist' ? 'Industrial Brutalist' : v.id === 'softhigh' ? 'High-End Soft' : 'Editorial Luxury';
          return (
            <button key={v.id} onClick={() => onVariant(v.id)} style={{
              padding: '12px 18px',
              background: variant === v.id ? '#E55D1F' : 'transparent',
              color: variant === v.id ? '#FFF' : '#E8E6E0',
              border: 'none',
              borderRight: '1px solid #2A2926',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: variant === v.id ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 200ms',
            }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, opacity: 0.7 }}>{code}</span>
              <span>{name}</span>
              <span style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.12em', marginLeft: 4 }}>{v.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Section selector */}
      <div style={{ display: 'flex', gap: 0, padding: '0 20px', alignItems: 'stretch' }}>
        <span style={{ alignSelf: 'center', fontSize: 11, color: '#6E6C66', textTransform: 'uppercase', letterSpacing: '0.16em', marginRight: 16 }}>Sección</span>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => onSection(s.id)} style={{
            padding: '10px 18px',
            background: section === s.id ? '#1F1F1B' : 'transparent',
            color: section === s.id ? '#FFF' : '#9E9C95',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            borderBottom: section === s.id ? '2px solid #E55D1F' : '2px solid transparent',
            textAlign: 'left',
          }}>
            <div>{s.label}</div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{s.sub}</div>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <a href="/" style={{
          alignSelf: 'center',
          fontSize: 11, color: '#9E9C95',
          textDecoration: 'none',
          textTransform: 'uppercase', letterSpacing: '0.14em',
        }}>← volver a la app</a>
      </div>
    </div>
  );
}
