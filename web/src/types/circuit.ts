// ---------------------------------------------------------------------------
// Shared data types matching the JSON contract defined in json_io.hpp.
// The C++ engine (and the TS fallback solver) both operate on these shapes.
// ---------------------------------------------------------------------------

/** Branch types that actually reach the solver (OC and L are filtered out). */
export type BranchType = 'R' | 'V' | 'I' | 'G' | 'E' | 'F' | 'H';

export interface Branch {
  type:   BranchType;
  n1:     number;   // pin1 node (+ terminal for V/E, output-from for I/G, node_a for R)
  n2:     number;   // pin2 node (− terminal for V/E, output-to for I/G, node_b for R)
  value:  number;   // Ω / V / A / S / (gain)
  /** Control + node (VCCS/VCVS only). */
  nc1?:   number;
  /** Control − node (VCCS/VCVS only). */
  nc2?:   number;
}

export interface CircuitInput {
  node_count: number;
  branches:   Branch[];
}

export type SolveResult =
  | { ok: true;  node_voltages: number[]; branch_currents: number[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Human-readable labels for each branch type
// ---------------------------------------------------------------------------

export const BRANCH_LABELS: Record<BranchType, { name: string; unit: string; placeholder: string }> = {
  R: { name: 'Resistor',             unit: 'Ω', placeholder: 'e.g. 1000'  },
  V: { name: 'Voltage Source',       unit: 'V', placeholder: 'e.g. 10'    },
  I: { name: 'Current Source',       unit: 'A', placeholder: 'e.g. 0.002' },
  G: { name: 'VCCS (gm)',            unit: 'S', placeholder: 'e.g. 0.01'  },
  E: { name: 'VCVS (gain μ)',        unit: '×', placeholder: 'e.g. 2'     },
  F: { name: 'CCCS (β)',             unit: '×', placeholder: 'e.g. 50'    },
  H: { name: 'CCVS (rm)',            unit: 'Ω', placeholder: 'e.g. 1000'  },
};
