import type { GridPoint, PlacedComponent, ComponentType } from './types';
import { GRID, COMP_UNITS } from './constants';

/** Grid position of pin 2 (the second output terminal). */
export function getPin2(c: PlacedComponent): GridPoint {
  switch (c.rotation) {
    case   0: return { x: c.pin1.x + COMP_UNITS, y: c.pin1.y              };
    case  90: return { x: c.pin1.x,              y: c.pin1.y + COMP_UNITS };
    case 180: return { x: c.pin1.x - COMP_UNITS, y: c.pin1.y              };
    case 270: return { x: c.pin1.x,              y: c.pin1.y - COMP_UNITS };
  }
}

/**
 * Grid position of the + control terminal (for VCCS/VCVS only).
 *
 * In the local SVG frame the control leads exit at (40, -40) and (40, +40).
 * After applying the rotation transform those map to the grid positions below.
 *
 * Rotation table (verified against SVG rotate(deg) = (x,y) → (-y·sin+x·cos, x·sin+y·cos)):
 *   0°  : (pin1.x+1, pin1.y-1)  — above centre
 *   90° : (pin1.x+1, pin1.y+1)  — right of centre
 *   180°: (pin1.x-1, pin1.y+1)  — below centre
 *   270°: (pin1.x-1, pin1.y-1)  — left of centre
 */
export function getCtrlPin1(c: PlacedComponent): GridPoint {
  switch (c.rotation) {
    case   0: return { x: c.pin1.x + 1, y: c.pin1.y - 1 };
    case  90: return { x: c.pin1.x + 1, y: c.pin1.y + 1 };
    case 180: return { x: c.pin1.x - 1, y: c.pin1.y + 1 };
    case 270: return { x: c.pin1.x - 1, y: c.pin1.y - 1 };
  }
}

/** Grid position of the − control terminal (for VCCS/VCVS only). */
export function getCtrlPin2(c: PlacedComponent): GridPoint {
  switch (c.rotation) {
    case   0: return { x: c.pin1.x + 1, y: c.pin1.y + 1 };
    case  90: return { x: c.pin1.x - 1, y: c.pin1.y + 1 };
    case 180: return { x: c.pin1.x - 1, y: c.pin1.y - 1 };
    case 270: return { x: c.pin1.x + 1, y: c.pin1.y - 1 };
  }
}

/**
 * Dependent sources (G, E, F, H) are now 2-terminal.
 * Control is specified via the controlVar reference, not physical pins.
 */
export function hasCtrlPins(_type: ComponentType): boolean {
  return false;
}

/**
 * All electrically significant pin positions for a component.
 * For 4-terminal devices this includes ctrl pins.
 */
export function allPinsOf(c: PlacedComponent): GridPoint[] {
  const base: GridPoint[] = [c.pin1, getPin2(c)];
  if (hasCtrlPins(c.type)) base.push(getCtrlPin1(c), getCtrlPin2(c));
  return base;
}

export function toScreen(p: GridPoint): { x: number; y: number } {
  return { x: p.x * GRID, y: p.y * GRID };
}

export function snapToGrid(screenX: number, screenY: number): GridPoint {
  return {
    x: Math.round(screenX / GRID),
    y: Math.round(screenY / GRID),
  };
}

export function gridEq(a: GridPoint | null, b: GridPoint | null): boolean {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

export function gk(p: GridPoint): string {
  return `${p.x},${p.y}`;
}

export function formatValue(value: number, type: ComponentType, controlVar?: string): string {
  const ctrl = controlVar?.trim() ? `·${controlVar.trim()}` : '';
  if (type === 'OC') return 'open';
  if (type === 'A')  return 'probe';

  // Dependent sources: show as a plain multiplier (×β, ×μ, ×gm, ×rm).
  // H (CCVS) omits the Ω unit — the CCVS badge already communicates the type.
  if (type === 'E' || type === 'F' || type === 'H')
    return `×${value % 1 === 0 ? value.toFixed(0) : value.toPrecision(3)}${ctrl}`;

  const abs  = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  let num: string;
  if (abs >= 1e6)       num = sign + (abs / 1e6).toPrecision(3) + 'M';
  else if (abs >= 1e3)  num = sign + (abs / 1e3).toPrecision(3) + 'k';
  else if (abs >= 1)    num = sign + abs.toPrecision(3);
  else if (abs >= 1e-3) num = sign + (abs * 1e3).toPrecision(3) + 'm';
  else                  num = sign + (abs * 1e6).toPrecision(3) + 'µ';

  const unit =
    type === 'R' ? 'Ω' :
    type === 'V' ? 'V' :
    type === 'I' ? 'A' :
    type === 'G' ? 'S' : '';
  return num + unit + ctrl;
}
