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

// ── Current Probe (Ammeter) ───────────────────────────────────────────────
// A 0 V series element used to define a named branch current (e.g. "i₁").
// Visually: two short leads + a circle containing a small "A" letter.
// Place it in series in the branch whose current you want to reference.
export function AmmeterShape() {
  return (
    <>
      <line x1={0}  y1={0} x2={23} y2={0} {...SW} />
      <circle cx={40} cy={0} r={17} fill="white" stroke="currentColor" strokeWidth={2} />
      {/* "A" label inside circle */}
      <text x={40} y={5} textAnchor="middle" fontSize={15} fontWeight="700"
        fill="currentColor" pointerEvents="none" fontFamily="serif">A</text>
      <line x1={57} y1={0} x2={80} y2={0} {...SW} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared geometry for the four dependent-source diamonds.
//
// All 4 types are now pure 2-terminal devices (no physical control leads).
// The dependency is specified via a "controlVar" text field in the editor
// and displayed as a small expression inside the diamond.
//
// Local coords: pin1=(0,0) · pin2=(80,0)
// Diamond: left(14,0) · top(40,−23) · right(66,0) · bottom(40,23)
// ─────────────────────────────────────────────────────────────────────────
const D_PTS = "14,0 40,-23 66,0 40,23";

// Output leads (same for all dependent sources)
function OutLeads() {
  return (
    <>
      <line x1={0}  y1={0} x2={14} y2={0} {...SW} />
      <line x1={66} y1={0} x2={80} y2={0} {...SW} />
    </>
  );
}

// Current-output arrow → inside diamond
function IOutputSymbol() {
  return (
    <>
      <line x1={21} y1={0} x2={45} y2={0} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <polygon points="52,0 42,-6 42,6" fill="currentColor" />
    </>
  );
}

// Voltage-output +/− inside diamond
function VOutputSymbol() {
  return (
    <>
      <line x1={24} y1={-4} x2={24} y2={4}  stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={20} y1={0}  x2={28} y2={0}  stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={52} y1={0}  x2={60} y2={0}  stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  );
}

// Small label strip at bottom of diamond showing the type pill and controlVar
function DiamondLabels({
  typePill, pillColor, controlVar,
}: {
  typePill: string;
  pillColor: string;
  controlVar?: string;
}) {
  const cv   = controlVar?.trim() ?? '';
  const pill = typePill;
  const pw   = pill.length * 5.8 + 8;
  return (
    <g pointerEvents="none">
      {/* Type pill — upper part of diamond interior */}
      <rect x={40 - pw / 2} y={-11} width={pw} height={10} rx={2}
        fill={pillColor} fillOpacity={0.18} stroke={pillColor} strokeOpacity={0.45} strokeWidth={0.7} />
      <text x={40} y={-3} textAnchor="middle" fontSize={7} fill="currentColor" fontWeight="700"
        letterSpacing="0.2">{pill}</text>
      {/* controlVar expression — lower part */}
      {cv && (
        <>
          <rect x={40 - (cv.length * 5 + 6) / 2} y={3} width={cv.length * 5 + 6} height={10} rx={2}
            fill="#fff9e6" stroke="#e8c000" strokeWidth={0.7} />
          <text x={40} y={11} textAnchor="middle" fontSize={7.5} fill="#6b4f00" fontStyle="italic"
            fontWeight="600">{cv}</text>
        </>
      )}
      {/* "?" indicator when no control is set */}
      {!cv && (
        <text x={40} y={12} textAnchor="middle" fontSize={8} fill="#aaa">?</text>
      )}
    </g>
  );
}

// ── VCCS (G) ─────────────────────────────────────────────────────────────
function VccsShape({ controlVar }: { controlVar?: string }) {
  return (
    <>
      <OutLeads />
      <polygon points={D_PTS} fill="white" stroke="currentColor" strokeWidth={2} />
      <IOutputSymbol />
      <DiamondLabels typePill="VCCS" pillColor="#2563eb" controlVar={controlVar} />
    </>
  );
}

// ── VCVS (E) ─────────────────────────────────────────────────────────────
function VcvsShape({ controlVar }: { controlVar?: string }) {
  return (
    <>
      <OutLeads />
      <polygon points={D_PTS} fill="white" stroke="currentColor" strokeWidth={2} />
      <VOutputSymbol />
      <DiamondLabels typePill="VCVS" pillColor="#7c3aed" controlVar={controlVar} />
    </>
  );
}

// ── CCCS (F) ─────────────────────────────────────────────────────────────
function CccsShape({ controlVar }: { controlVar?: string }) {
  return (
    <>
      <OutLeads />
      <polygon points={D_PTS} fill="white" stroke="currentColor" strokeWidth={2} />
      <IOutputSymbol />
      <DiamondLabels typePill="CCCS" pillColor="#ea580c" controlVar={controlVar} />
    </>
  );
}

// ── CCVS (H) ─────────────────────────────────────────────────────────────
function CcvsShape({ controlVar }: { controlVar?: string }) {
  return (
    <>
      <OutLeads />
      <polygon points={D_PTS} fill="white" stroke="currentColor" strokeWidth={2} />
      <VOutputSymbol />
      <DiamondLabels typePill="CCVS" pillColor="#dc2626" controlVar={controlVar} />
    </>
  );
}

// ── Public API ────────────────────────────────────────────────────────────

export function ComponentShape({
  type,
  controlVar,
}: {
  type: ComponentType;
  controlVar?: string;
}) {
  switch (type) {
    case 'R':  return <ResistorShape />;
    case 'V':  return <VoltageSourceShape />;
    case 'I':  return <CurrentSourceShape />;
    case 'OC': return <OpenCircuitShape />;
    case 'A':  return <AmmeterShape />;
    case 'G':  return <VccsShape controlVar={controlVar} />;
    case 'E':  return <VcvsShape controlVar={controlVar} />;
    case 'F':  return <CccsShape controlVar={controlVar} />;
    case 'H':  return <CcvsShape controlVar={controlVar} />;
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
