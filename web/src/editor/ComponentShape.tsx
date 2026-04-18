// SVG shapes for each component type.
//
// LOCAL coordinate system:
//   pin1 at (0, 0) — pin2 at (80, 0)   ← output / main port axis
//
// 4-terminal devices (G, E, F, H) also have control port leads that exit at
//   ctrl+: (40, -40)   ctrl−: (40, +40)  (perpendicular to the main axis)
//
// The parent <g> applies translate(s1.x, s1.y) + rotate(deg) so every shape
// works consistently for all four orientations.

import type { ComponentType } from './types';

const SW: React.SVGProps<SVGLineElement> = {
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
};

// ── Resistor ──────────────────────────────────────────────────────────────
export function ResistorShape() {
  return (
    <>
      <line x1={0} y1={0} x2={20} y2={0} {...SW} />
      <polyline
        points="20,0 25,-11 32,11 39,-11 46,11 53,-11 60,0"
        fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinejoin="miter" strokeLinecap="round"
      />
      <line x1={60} y1={0} x2={80} y2={0} {...SW} />
    </>
  );
}

// ── Voltage Source ────────────────────────────────────────────────────────
export function VoltageSourceShape() {
  return (
    <>
      <line x1={0} y1={0} x2={23} y2={0} {...SW} />
      <circle cx={40} cy={0} r={17} fill="white" stroke="currentColor" strokeWidth={2} />
      <line x1={29} y1={0}  x2={36} y2={0}  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <line x1={32} y1={-3} x2={32} y2={3}  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <line x1={44} y1={0}  x2={51} y2={0}  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <line x1={57} y1={0} x2={80} y2={0} {...SW} />
    </>
  );
}

// ── Current Source ────────────────────────────────────────────────────────
export function CurrentSourceShape() {
  return (
    <>
      <line x1={0} y1={0} x2={23} y2={0} {...SW} />
      <circle cx={40} cy={0} r={17} fill="white" stroke="currentColor" strokeWidth={2} />
      <line x1={27} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <polygon points="55,0 45,-6 45,6" fill="currentColor" />
      <line x1={57} y1={0} x2={80} y2={0} {...SW} />
    </>
  );
}

// ── Open Circuit ──────────────────────────────────────────────────────────
export function OpenCircuitShape() {
  return (
    <>
      <line x1={0}  y1={0} x2={18} y2={0} {...SW} />
      <line x1={62} y1={0} x2={80} y2={0} {...SW} />
      <circle cx={22} cy={0} r={6} fill="white" stroke="currentColor" strokeWidth={2} />
      <circle cx={58} cy={0} r={6} fill="white" stroke="currentColor" strokeWidth={2} />
      <line x1={28} y1={0} x2={52} y2={0}
        stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared geometry for the four dependent-source diamonds
// ─────────────────────────────────────────────────────────────────────────
//
// Diamond corners: left (14,0) · top (40,−23) · right (66,0) · bottom (40,23)
// This is 52 px wide × 46 px tall — noticeably taller than before so the
// internal symbols are readable and the ctrl-lead arrows have clear clearance.
const D_PTS = "14,0 40,-23 66,0 40,23";

// Output leads (common to all 4 types)
function OutLeads() {
  return (
    <>
      <line x1={0}  y1={0} x2={14} y2={0} {...SW} />
      <line x1={66} y1={0} x2={80} y2={0} {...SW} />
    </>
  );
}

// Voltage-sense control leads — dashed, no current flows through ctrl port
function VCtrlLeads() {
  const st = { stroke: 'currentColor', strokeWidth: 1.6, strokeDasharray: '3.5 2.5' } as const;
  return (
    <>
      <line x1={40} y1={-40} x2={40} y2={-23} style={st} />
      <line x1={40} y1={23}  x2={40} y2={40}  style={st} />
      {/* + / − polarity labels near ctrl pins */}
      <text x={33} y={-27} fontSize={9} fill="currentColor" fontWeight="700" pointerEvents="none">+</text>
      <text x={33} y={33}  fontSize={9} fill="currentColor" fontWeight="700" pointerEvents="none">−</text>
    </>
  );
}

// Current-sense control leads — solid with a directional arrowhead
// Positive sense current flows INTO ctrl+ (downward through the diamond)
function ICtrlLeads() {
  return (
    <>
      <line x1={40} y1={-40} x2={40} y2={-23} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <line x1={40} y1={23}  x2={40} y2={40}  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      {/* Arrow on top lead: points downward (current entering ctrl+) */}
      <polygon points="40,-29 37,-36 43,-36" fill="currentColor" />
      {/* Arrow on bottom lead: points downward (current leaving ctrl−) */}
      <polygon points="40,36 37,29 43,29" fill="currentColor" />
    </>
  );
}

// Current-output symbol: horizontal arrow → inside the diamond
function IOutputSymbol() {
  return (
    <>
      <line x1={21} y1={0} x2={45} y2={0} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <polygon points="52,0 42,-6 42,6" fill="currentColor" />
    </>
  );
}

// Voltage-output symbol: + cross on left, − bar on right inside the diamond
function VOutputSymbol() {
  return (
    <>
      {/* + on pin1 side */}
      <line x1={24} y1={-4} x2={24} y2={4}  stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={20} y1={0}  x2={28} y2={0}  stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      {/* − on pin2 side */}
      <line x1={52} y1={0}  x2={60} y2={0}  stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  );
}

// Type-badge pill: centered below the diamond center (y ≈ 8) so it stays
// inside the diamond body with a subtle tinted background
function TypeBadge({ label, color }: { label: string; color: string }) {
  const w = label.length * 6 + 8;
  return (
    <g pointerEvents="none">
      <rect x={40 - w / 2} y={7} width={w} height={11} rx={2.5}
        fill={color} fillOpacity={0.18} stroke={color} strokeOpacity={0.4} strokeWidth={0.8} />
      <text x={40} y={16} textAnchor="middle" fontSize={7.5} fill="currentColor" fontWeight="700"
        letterSpacing="0.3">{label}</text>
    </g>
  );
}

// ── VCCS — Voltage-Controlled Current Source ─────────────────────────────
function VccsShape() {
  return (
    <>
      <OutLeads />
      <VCtrlLeads />
      <polygon points={D_PTS} fill="white" stroke="currentColor" strokeWidth={2} />
      <IOutputSymbol />
      <TypeBadge label="VCCS" color="#2563eb" />
    </>
  );
}

// ── VCVS — Voltage-Controlled Voltage Source ──────────────────────────────
function VcvsShape() {
  return (
    <>
      <OutLeads />
      <VCtrlLeads />
      <polygon points={D_PTS} fill="white" stroke="currentColor" strokeWidth={2} />
      <VOutputSymbol />
      <TypeBadge label="VCVS" color="#7c3aed" />
    </>
  );
}

// ── CCCS — Current-Controlled Current Source ─────────────────────────────
function CccsShape() {
  return (
    <>
      <OutLeads />
      <ICtrlLeads />
      <polygon points={D_PTS} fill="white" stroke="currentColor" strokeWidth={2} />
      <IOutputSymbol />
      <TypeBadge label="CCCS" color="#ea580c" />
    </>
  );
}

// ── CCVS — Current-Controlled Voltage Source ──────────────────────────────
function CcvsShape() {
  return (
    <>
      <OutLeads />
      <ICtrlLeads />
      <polygon points={D_PTS} fill="white" stroke="currentColor" strokeWidth={2} />
      <VOutputSymbol />
      <TypeBadge label="CCVS" color="#dc2626" />
    </>
  );
}

// ── Public API ────────────────────────────────────────────────────────────

export function ComponentShape({ type }: { type: ComponentType }) {
  switch (type) {
    case 'R':  return <ResistorShape />;
    case 'V':  return <VoltageSourceShape />;
    case 'I':  return <CurrentSourceShape />;
    case 'OC': return <OpenCircuitShape />;
    case 'G':  return <VccsShape />;
    case 'E':  return <VcvsShape />;
    case 'F':  return <CccsShape />;
    case 'H':  return <CcvsShape />;
  }
}

/** Ground symbol: centred at (0, 0), hangs downward. */
export function GroundSymbol() {
  return (
    <g>
      <line x1={0}   y1={0}  x2={0}  y2={10} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={-13} y1={10} x2={13} y2={10} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={-8}  y1={16} x2={8}  y2={16} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={-3}  y1={22} x2={3}  y2={22} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}
