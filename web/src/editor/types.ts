/**
 * Types sent to the solver.
 *   R  — resistor
 *   V  — independent voltage source
 *   I  — independent current source
 *   G  — VCCS  (voltage-controlled current source)
 *   E  — VCVS  (voltage-controlled voltage source)
 *   F  — CCCS  (current-controlled current source)
 *   H  — CCVS  (current-controlled voltage source)
 */
export type SolverBranchType = 'R' | 'V' | 'I' | 'G' | 'E' | 'F' | 'H';

/**
 * All placed-component types.
 * 'OC' = open circuit probe (2-pin, generates no branch).
 */
export type ComponentType = SolverBranchType | 'OC';

/**
 * Everything selectable in the palette, including the wire-label tool.
 * 'L' is not a component; it places a WireLabel marker instead.
 */
export type ToolType = ComponentType | 'L';

/** A placed component on the schematic canvas. */
export interface PlacedComponent {
  id: string;
  type: ComponentType;
  /**
   * Numeric value whose meaning depends on type:
   *   R → resistance (Ω)
   *   V → voltage (V)
   *   I → current (A)
   *   G → transconductance gm (S)
   *   E → voltage gain μ (dimensionless)
   *   OC → not used (0)
   */
  value: number;
  /** Grid-coordinate of pin 1 (positive/from terminal). */
  pin1: { x: number; y: number };
  /** Rotation in degrees CW around pin1. pin2 offset: 0→+x, 90→+y, 180→−x, 270→−y. */
  rotation: 0 | 90 | 180 | 270;
}

/** A wire segment connecting two grid points. */
export interface Wire {
  id: string;
  from: { x: number; y: number };
  to:   { x: number; y: number };
}

/**
 * A named net marker.
 * Any two WireLabel entries with the same `text` are electrically connected,
 * even without a physical wire between them.
 */
export interface WireLabel {
  id: string;
  /** Net name (must be non-empty and identical on both ends to connect). */
  text: string;
  /** Grid point where this label is anchored. */
  point: { x: number; y: number };
}

export interface GridPoint { x: number; y: number; }

export interface Schematic {
  components:  PlacedComponent[];
  wires:       Wire[];
  labels:      WireLabel[];
  /** The grid point designated as node 0 (GND). */
  groundPoint: GridPoint | null;
}
