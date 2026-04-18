export type BranchType = 'R' | 'V' | 'I';

export interface GridPoint { x: number; y: number; }

/** A placed component on the schematic canvas. */
export interface PlacedComponent {
  id: string;
  type: BranchType;
  value: number;
  /** Grid-coordinate of pin 1 (positive terminal for V/I, node_a for R). */
  pin1: GridPoint;
  /** Rotation in degrees CW around pin1. pin2 offset: 0→+x, 90→+y, 180→−x, 270→−y. */
  rotation: 0 | 90 | 180 | 270;
}

/** A wire segment connecting two grid points. */
export interface Wire {
  id: string;
  from: GridPoint;
  to: GridPoint;
}

export interface Schematic {
  components: PlacedComponent[];
  wires:      Wire[];
  /** The grid point designated as node 0 (GND). */
  groundPoint: GridPoint | null;
}
