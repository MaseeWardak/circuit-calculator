// ---------------------------------------------------------------------------
// Shared data types matching the JSON contract defined in json_io.hpp.
// The C++ engine (and the TS fallback solver) both operate on these shapes.
// ---------------------------------------------------------------------------

export type BranchType = 'R' | 'V' | 'I';

export interface Branch {
  type: BranchType;
  n1: number;
  n2: number;
  value: number;
}

export interface CircuitInput {
  node_count: number;
  branches: Branch[];
}

export type SolveResult =
  | { ok: true;  node_voltages: number[]; branch_currents: number[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Human-readable labels for each branch type
// ---------------------------------------------------------------------------

export const BRANCH_LABELS: Record<BranchType, { name: string; unit: string; placeholder: string }> = {
  R: { name: 'Resistor',        unit: 'Ω',  placeholder: 'e.g. 1000' },
  V: { name: 'Voltage Source',  unit: 'V',  placeholder: 'e.g. 10'   },
  I: { name: 'Current Source',  unit: 'A',  placeholder: 'e.g. 0.002' },
};
