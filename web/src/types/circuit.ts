// ---------------------------------------------------------------------------
// Shared data types matching the JSON contract defined in json_io.hpp.
// The C++ engine (and the TS fallback solver) both operate on these shapes.
// ---------------------------------------------------------------------------

/** Branch types that actually reach the solver (OC, A, L are filtered/converted). */
export type BranchType = 'R' | 'V' | 'I' | 'G' | 'E' | 'F' | 'H';

/** Extended type for display-only purposes (includes converted/probe types). */
export type DisplayBranchType = BranchType | 'A';

export interface Branch {
  type:   BranchType;
  n1:     number;   // pin1 node
  n2:     number;   // pin2 node
  value:  number;   // Ω / V / A / S (gm) / gain / rm

  /** G and E: control node +. Also F/H converted from a resistor reference (gm_eff = β/R or μ_eff = rm/R). */
  nc1?:   number;
  /** G and E: control node −. See nc1. */
  nc2?:   number;

  /**
   * F and H when the controlling component is a voltage source:
   * index of the controlling V-branch (0-based) in the branch list.
   * The solver uses this to reference the VS current extra-unknown column.
   */
  vs_ctrl_idx?: number;

  /**
   * Original component type before internal conversion.
   * Set when F/H is converted to G/E (resistor control) or A → V.
   * ResultsPanel uses this for display.
   */
  displayType?: DisplayBranchType;
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

export const BRANCH_LABELS: Record<DisplayBranchType, { name: string; unit: string; placeholder: string }> = {
  R: { name: 'Resistor',             unit: 'Ω', placeholder: 'e.g. 1000'  },
  V: { name: 'Voltage Source',       unit: 'V', placeholder: 'e.g. 10'    },
  I: { name: 'Current Source',       unit: 'A', placeholder: 'e.g. 0.002' },
  G: { name: 'VCCS (gm)',            unit: 'S', placeholder: 'e.g. 0.01'  },
  E: { name: 'VCVS (gain μ)',        unit: '×', placeholder: 'e.g. 2'     },
  F: { name: 'CCCS (β)',             unit: '×', placeholder: 'e.g. 50'    },
  H: { name: 'CCVS (rm)',            unit: '×', placeholder: 'e.g. 15'    },
  A: { name: 'Current Probe',        unit: 'A', placeholder: ''           },
};
