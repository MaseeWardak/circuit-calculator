// SVG shapes for each component type.
// All shapes are drawn in a LOCAL coordinate system:
//   pin1 is at (0, 0), pin2 is at (80, 0).
// The parent <g> applies translate + rotate so the shapes stay simple.

import type { BranchType } from './types';

const SW: React.SVGProps<SVGLineElement> = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' };

// ── Resistor ──────────────────────────────────────────────────────────────
// American standard: leads + zigzag body
function ResistorShape() {
  return (
    <>
      {/* Left lead */}
      <line x1={0} y1={0} x2={20} y2={0} {...SW} />
      {/* Zigzag body: 6 peaks spanning x=20..60 */}
      <polyline
        points="20,0 25,-11 32,11 39,-11 46,11 53,-11 60,0"
        fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinejoin="miter" strokeLinecap="round"
      />
      {/* Right lead */}
      <line x1={60} y1={0} x2={80} y2={0} {...SW} />
    </>
  );
}

// ── Voltage Source ────────────────────────────────────────────────────────
// Circle with + on pin1 side and − on pin2 side
function VoltageSourceShape() {
  return (
    <>
      <line x1={0} y1={0} x2={23} y2={0} {...SW} />
      <circle cx={40} cy={0} r={17} fill="white" stroke="currentColor" strokeWidth={2} />
      {/* "+" symbol left of center (pin1 = positive) */}
      <line x1={29} y1={0}  x2={36} y2={0}  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <line x1={32} y1={-3} x2={32} y2={3}  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      {/* "−" symbol right of center (pin2 = negative) */}
      <line x1={44} y1={0}  x2={51} y2={0}  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <line x1={57} y1={0} x2={80} y2={0} {...SW} />
    </>
  );
}

// ── Current Source ────────────────────────────────────────────────────────
// Circle with arrow pointing from pin1 toward pin2
function CurrentSourceShape() {
  return (
    <>
      <line x1={0} y1={0} x2={23} y2={0} {...SW} />
      <circle cx={40} cy={0} r={17} fill="white" stroke="currentColor" strokeWidth={2} />
      {/* Shaft */}
      <line x1={27} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      {/* Arrowhead tip at x=55, pointing right */}
      <polygon points="55,0 45,-6 45,6" fill="currentColor" />
      <line x1={57} y1={0} x2={80} y2={0} {...SW} />
    </>
  );
}

// ── Public API ────────────────────────────────────────────────────────────

export function ComponentShape({ type }: { type: BranchType }) {
  switch (type) {
    case 'R': return <ResistorShape />;
    case 'V': return <VoltageSourceShape />;
    case 'I': return <CurrentSourceShape />;
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
