// ---------------------------------------------------------------------------
// DC Linear MNA solver — TypeScript implementation.
//
// Matches the new dependent-source contract:
//   G (VCCS): nc1/nc2 present.  I = gm·(V_nc1 − V_nc2)
//   E (VCVS): nc1/nc2 present.  V_out = μ·(V_nc1 − V_nc2). 1 extra unknown.
//   F (CCCS): vs_ctrl_idx set.  I = β·I_vs_k.              0 extra unknowns.
//   H (CCVS): vs_ctrl_idx set.  V_out = rm·I_vs_k.         1 extra unknown.
//
//   NOTE: CCCS/CCVS referencing a resistor are emitted by toNetlist as
//   type='G'/'E' (with displayType='F'/'H') so the solver never sees F/H
//   with nc1/nc2 — only F/H with vs_ctrl_idx.
//
// dim = nFree + nVs + nVcvs + nHs
// ---------------------------------------------------------------------------

import type { CircuitInput, SolveResult } from '../types/circuit';

function gaussianElim(A: number[], b: number[], n: number): void {
  const tol = 1e-12;
  for (let k = 0; k < n; k++) {
    let pivot = k, best = Math.abs(A[k * n + k]);
    for (let r = k + 1; r < n; r++) {
      const v = Math.abs(A[r * n + k]);
      if (v > best) { best = v; pivot = r; }
    }
    if (best < tol)
      throw new Error('Circuit matrix is singular – check for floating nodes or short circuits.');
    if (pivot !== k) {
      for (let c = 0; c < n; c++) {
        const t = A[k * n + c]; A[k * n + c] = A[pivot * n + c]; A[pivot * n + c] = t;
      }
      const tb = b[k]; b[k] = b[pivot]; b[pivot] = tb;
    }
    const akk = A[k * n + k];
    for (let r = k + 1; r < n; r++) {
      const f = A[r * n + k] / akk;
      A[r * n + k] = 0;
      for (let c = k + 1; c < n; c++) A[r * n + c] -= f * A[k * n + c];
      b[r] -= f * b[k];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < n; c++) sum -= A[r * n + c] * b[c];
    const arr = A[r * n + r];
    if (Math.abs(arr) < tol) throw new Error('Back substitution failed.');
    b[r] = sum / arr;
  }
}

function unkIdx(node: number): number { return node <= 0 ? -1 : node - 1; }

export function solveCircuit(input: CircuitInput): SolveResult {
  try {
    const { node_count, branches } = input;
    if (node_count < 1) return { ok: false, error: 'node_count must be at least 1.' };

    const nFree = node_count - 1;
    const nVs   = branches.filter(b => b.type === 'V').length;
    const nVcvs = branches.filter(b => b.type === 'E').length;
    const nHs   = branches.filter(b => b.type === 'H').length;
    const dim   = nFree + nVs + nVcvs + nHs;

    if (dim <= 0) return { ok: true, node_voltages: [0], branch_currents: [] };

    const A    = new Array<number>(dim * dim).fill(0);
    const bVec = new Array<number>(dim).fill(0);
    const add  = (r: number, c: number, v: number) => { A[r * dim + c] += v; };

    // ── Resistors ──────────────────────────────────────────────────────────
    for (const br of branches) {
      if (br.type !== 'R') continue;
      if (br.value <= 0)
        return { ok: false, error: `Resistance must be positive (got ${br.value}).` };
      const g = 1 / br.value;
      const ua = unkIdx(br.n1), ub = unkIdx(br.n2);
      if (ua >= 0) add(ua, ua,  g);
      if (ub >= 0) add(ub, ub,  g);
      if (ua >= 0 && ub >= 0) { add(ua, ub, -g); add(ub, ua, -g); }
    }

    // ── Independent current sources ────────────────────────────────────────
    for (const br of branches) {
      if (br.type !== 'I') continue;
      const uf = unkIdx(br.n1), ut = unkIdx(br.n2);
      if (uf >= 0) bVec[uf] -= br.value;
      if (ut >= 0) bVec[ut] += br.value;
    }

    // ── VCCS (G): I = gm·(V_nc1 − V_nc2) ─────────────────────────────────
    // Also used for CCCS-from-resistor (displayType='F'), same stamp.
    for (const br of branches) {
      if (br.type !== 'G') continue;
      if (br.nc1 === undefined || br.nc2 === undefined)
        return { ok: false, error: 'VCCS branch missing nc1/nc2.' };
      const gm  = br.value;
      const uf  = unkIdx(br.n1), ut  = unkIdx(br.n2);
      const ucp = unkIdx(br.nc1), ucm = unkIdx(br.nc2);
      if (ut >= 0 && ucp >= 0) add(ut,  ucp,  gm);
      if (ut >= 0 && ucm >= 0) add(ut,  ucm, -gm);
      if (uf >= 0 && ucp >= 0) add(uf,  ucp, -gm);
      if (uf >= 0 && ucm >= 0) add(uf,  ucm,  gm);
    }

    // ── Independent voltage sources ────────────────────────────────────────
    let vsIdx = 0;
    for (const br of branches) {
      if (br.type !== 'V') continue;
      const col = nFree + vsIdx++;
      const up = unkIdx(br.n1), um = unkIdx(br.n2);
      if (up >= 0) { add(up, col, 1); add(col, up, 1); }
      if (um >= 0) { add(um, col,-1); add(col, um,-1); }
      bVec[col] = br.value;
    }

    // ── VCVS (E): V_out = μ·(V_nc1 − V_nc2) ─────────────────────────────
    // Also used for CCVS-from-resistor (displayType='H'), same stamp.
    let vcvsIdx = 0;
    for (const br of branches) {
      if (br.type !== 'E') continue;
      if (br.nc1 === undefined || br.nc2 === undefined)
        return { ok: false, error: 'VCVS branch missing nc1/nc2.' };
      const mu  = br.value;
      const col = nFree + nVs + vcvsIdx++;
      const up = unkIdx(br.n1), um = unkIdx(br.n2);
      const ucp = unkIdx(br.nc1), ucm = unkIdx(br.nc2);
      if (up >= 0) { add(up, col, 1); add(col, up, 1); }
      if (um >= 0) { add(um, col,-1); add(col, um,-1); }
      if (ucp >= 0) add(col, ucp, -mu);
      if (ucm >= 0) add(col, ucm,  mu);
      bVec[col] = 0;
    }

    // ── CCCS (F): I_out = β·I_vs_k ────────────────────────────────────────
    // No extra unknown — just adds to existing VS current column.
    for (const br of branches) {
      if (br.type !== 'F') continue;
      if (br.vs_ctrl_idx === undefined)
        return { ok: false, error: 'CCCS branch missing vs_ctrl_idx.' };
      const beta   = br.value;
      const colVs  = nFree + br.vs_ctrl_idx;
      const uf = unkIdx(br.n1), ut = unkIdx(br.n2);
      if (ut >= 0) add(ut,  colVs,  beta);
      if (uf >= 0) add(uf,  colVs, -beta);
    }

    // ── CCVS (H): V_out = rm·I_vs_k ──────────────────────────────────────
    // 1 extra unknown per H (output VS current) at col = nFree + nVs + nVcvs + hIdx.
    let hIdx = 0;
    for (const br of branches) {
      if (br.type !== 'H') continue;
      if (br.vs_ctrl_idx === undefined)
        return { ok: false, error: 'CCVS branch missing vs_ctrl_idx.' };
      const rm    = br.value;
      const colVs = nFree + br.vs_ctrl_idx;
      const col   = nFree + nVs + nVcvs + hIdx++;
      const up = unkIdx(br.n1), um = unkIdx(br.n2);
      // KCL coupling (output terminal currents)
      if (up >= 0) { add(up, col, 1); add(col, up, 1); }
      if (um >= 0) { add(um, col,-1); add(col, um,-1); }
      // KVL: V_out+ − V_out− = rm · I_vs_k  →  A[col, colVs] -= rm
      add(col, colVs, -rm);
      bVec[col] = 0;
    }

    // ── Solve ──────────────────────────────────────────────────────────────
    gaussianElim(A, bVec, dim);

    const node_voltages: number[] = [0, ...bVec.slice(0, nFree)];

    // ── Extract branch currents in input order ─────────────────────────────
    const branch_currents: number[] = [];
    let vi2 = 0, ei2 = 0, hi2 = 0;
    for (const br of branches) {
      if (br.type === 'R') {
        const va = node_voltages[br.n1] ?? 0, vb = node_voltages[br.n2] ?? 0;
        branch_currents.push((va - vb) / br.value);
      } else if (br.type === 'V') {
        branch_currents.push(bVec[nFree + vi2++]);
      } else if (br.type === 'I') {
        branch_currents.push(br.value);
      } else if (br.type === 'G') {
        // Covers both VCCS and CCCS-from-resistor (displayType='F')
        const vcp = node_voltages[br.nc1!] ?? 0, vcm = node_voltages[br.nc2!] ?? 0;
        branch_currents.push(br.value * (vcp - vcm));
      } else if (br.type === 'E') {
        // Covers both VCVS and CCVS-from-resistor (displayType='H')
        branch_currents.push(bVec[nFree + nVs + ei2++]);
      } else if (br.type === 'F') {
        branch_currents.push(br.value * bVec[nFree + br.vs_ctrl_idx!]);
      } else if (br.type === 'H') {
        branch_currents.push(bVec[nFree + nVs + nVcvs + hi2++]);
      }
    }

    return { ok: true, node_voltages, branch_currents };

  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
