import type { GridPoint, PlacedComponent } from './types';
import { GRID, COMP_UNITS } from './constants';

export function getPin2(c: PlacedComponent): GridPoint {
  switch (c.rotation) {
    case   0: return { x: c.pin1.x + COMP_UNITS, y: c.pin1.y              };
    case  90: return { x: c.pin1.x,              y: c.pin1.y + COMP_UNITS };
    case 180: return { x: c.pin1.x - COMP_UNITS, y: c.pin1.y              };
    case 270: return { x: c.pin1.x,              y: c.pin1.y - COMP_UNITS };
  }
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

export function formatValue(value: number, type: BranchType): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  let num: string;
  if (abs >= 1e6)       num = sign + (abs / 1e6).toPrecision(3) + 'M';
  else if (abs >= 1e3)  num = sign + (abs / 1e3).toPrecision(3) + 'k';
  else if (abs >= 1)    num = sign + abs.toPrecision(3);
  else if (abs >= 1e-3) num = sign + (abs * 1e3).toPrecision(3) + 'm';
  else                  num = sign + (abs * 1e6).toPrecision(3) + 'µ';
  const unit = type === 'R' ? 'Ω' : type === 'V' ? 'V' : 'A';
  return num + unit;
}

/** Type needed here because it is referenced in formatValue above. */
type BranchType = PlacedComponent['type'];
