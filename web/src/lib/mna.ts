// ---------------------------------------------------------------------------
// DC Linear MNA solver — TypeScript implementation.
//
// This mirrors the C++ DcSolver exactly so the UI works without WASM.
// When Emscripten WASM is available (see solver.ts), this file is bypassed.
//
// Sign conventions (same as C++):
//  - node_voltages[0] = 0 (ground reference)
//  - resistor current: (V(n1) - V(n2)) / R, flowing n1 → n2
//  - current source current: equal to declared value (n1 → n2)
//  - voltage source current: SPICE convention – negative if the source
//    is supplying power to the circuit (current into + terminal from outside)
// ---------------------------------------------------------------------------

import type { CircuitInput, SolveResult } from '../types/circuit';

// ---------------------------------------------------------------------------
// Gaussian elimination with partial pivoting on a flat row-major matrix.
// Solves A·x = b in-place (b becomes x on output).
// ---------------------------------------------------------------------------
function gaussianElim(A: number[], b: number[], n: number): void {
  const tol = 1e-12;

  for (let k = 0; k < n; k++) {
    // Find the row with the largest absolute value in column k (partial pivot)
    let pivot = k;
    let best = Math.abs(A[k * n + k]);
    for (let r = k + 1; r < n; r++) {
      const v = Math.abs(A[r * n + k]);
      if (v > best) { best = v; pivot = r; }
    }
    if (best < tol) {
      throw new Error('Circuit matrix is singular – check for floating nodes or short circuits.');
    }

    // Swap rows k and pivot
    if (pivot !== k) {
      for (let c = 0; c < n; c++) {
        const tmp = A[k * n + c];
        A[k * n + c] = A[pivot * n + c];
        A[pivot * n + c] = tmp;
      }
      const tb = b[k]; b[k] = b[pivot]; b[pivot] = tb;
    }

    // Eliminate entries below the pivot
    const akk = A[k * n + k];
    for (let r = k + 1; r < n; r++) {
      const factor = A[r * n + k] / akk;
      A[r * n + k] = 0;
      for (let c = k + 1; c < n; c++) {
        A[r * n + c] -= factor * A[k * n + c];
      }
      b[r] -= factor * b[k];
    }
  }

  // Back substitution
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < n; c++) sum -= A[r * n + c] * b[c];
    const arr = A[r * n + r];
    if (Math.abs(arr) < tol) throw new Error('Back substitution failed.');
    b[r] = sum / arr;
  }
}

// Maps circuit node index to MNA unknown index (-1 for ground / node 0).
function unkIdx(node: number): number {
  return node <= 0 ? -1 : node - 1;
}

// ---------------------------------------------------------------------------
// Main solve function
// ---------------------------------------------------------------------------
export function solveCircuit(input: CircuitInput): SolveResult {
  try {
    const { node_count, branches } = input;

    if (node_count < 1) {
      return { ok: false, error: 'node_count must be at least 1.' };
    }

    const nFree = node_count - 1;
    const nVs   = branches.filter(b => b.type === 'V').length;
    const dim   = nFree + nVs;

    // Edge case: no unknowns (just ground)
    if (dim <= 0) {
      return { ok: true, node_voltages: [0], branch_currents: [] };
    }

    // Flat row-major MNA matrix and RHS vector, initialised to 0
    const A = new Array<number>(dim * dim).fill(0);
    const bVec = new Array<number>(dim).fill(0);

    const add = (r: number, c: number, v: number) => { A[r * dim + c] += v; };

    // --- Stamp resistors ---
    for (const br of branches) {
      if (br.type !== 'R') continue;
      if (br.value <= 0) {
        return { ok: false, error: `Resistance must be positive (got ${br.value}).` };
      }
      const g = 1.0 / br.value;
      const ua = unkIdx(br.n1);
      const ub = unkIdx(br.n2);
      if (ua >= 0) add(ua, ua,  g);
      if (ub >= 0) add(ub, ub,  g);
      if (ua >= 0 && ub >= 0) { add(ua, ub, -g); add(ub, ua, -g); }
    }

    // --- Stamp current sources ---
    for (const br of branches) {
      if (br.type !== 'I') continue;
      const uf = unkIdx(br.n1);
      const ut = unkIdx(br.n2);
      if (uf >= 0) bVec[uf] -= br.value;
      if (ut >= 0) bVec[ut] += br.value;
    }

    // --- Stamp voltage sources ---
    let vsIdx = 0;
    for (const br of branches) {
      if (br.type !== 'V') continue;
      const col = nFree + vsIdx;
      const up  = unkIdx(br.n1);
      const um  = unkIdx(br.n2);
      if (up >= 0) { add(up, col, 1); add(col, up, 1); }
      if (um >= 0) { add(um, col, -1); add(col, um, -1); }
      bVec[col] = br.value;
      vsIdx++;
    }

    // --- Solve ---
    gaussianElim(A, bVec, dim);

    // --- Extract node voltages ---
    const node_voltages: number[] = [0, ...bVec.slice(0, nFree)];

    // --- Compute branch currents in input order ---
    const branch_currents: number[] = [];
    let ri = 0, vi = 0;
    for (const br of branches) {
      if (br.type === 'R') {
        const va = node_voltages[br.n1] ?? 0;
        const vb = node_voltages[br.n2] ?? 0;
        branch_currents.push((va - vb) / br.value);
        ri++;
      } else if (br.type === 'V') {
        branch_currents.push(bVec[nFree + vi]);
        vi++;
      } else {
        // Current source: report declared value
        branch_currents.push(br.value);
      }
    }

    return { ok: true, node_voltages, branch_currents };

  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
