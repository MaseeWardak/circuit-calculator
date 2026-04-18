// ---------------------------------------------------------------------------
// DC Linear MNA solver — TypeScript implementation.
//
// Mirrors the C++ DcSolver so the UI works without WASM.
//
// Supported elements
//   R  — resistor
//   V  — independent voltage source
//   I  — independent current source
//   G  — VCCS  I = gm·(V_ctrl+ − V_ctrl−)
//   E  — VCVS  V_out = μ·(V_ctrl+ − V_ctrl−)
//   F  — CCCS  I_out = β·I_sense  (sense port wired in series, acts as 0V ammeter)
//   H  — CCVS  V_out = rm·I_sense (transresistance amplifier)
//
// Extra unknowns per element type
//   V  → 1  (source current)
//   E  → 1  (source current)
//   F  → 1  (sense ammeter current; output = β × that)
//   H  → 2  (sense current + output VS current)
//
// dim = nFree + nVs + nVcvs + nCccs + 2·nCcvs
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
    if (node_count < 1)
      return { ok: false, error: 'node_count must be at least 1.' };

    const nFree = node_count - 1;
    const nVs   = branches.filter(b => b.type === 'V').length;
    const nVcvs = branches.filter(b => b.type === 'E').length;
    const nCccs = branches.filter(b => b.type === 'F').length;
    const nCcvs = branches.filter(b => b.type === 'H').length;
    const dim   = nFree + nVs + nVcvs + nCccs + 2 * nCcvs;

    if (dim <= 0)
      return { ok: true, node_voltages: [0], branch_currents: [] };

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

    // ── Current sources ────────────────────────────────────────────────────
    for (const br of branches) {
      if (br.type !== 'I') continue;
      const uf = unkIdx(br.n1), ut = unkIdx(br.n2);
      if (uf >= 0) bVec[uf] -= br.value;
      if (ut >= 0) bVec[ut] += br.value;
    }

    // ── VCCS (G): I = gm·(Vctrl+ − Vctrl−) ───────────────────────────────
    for (const br of branches) {
      if (br.type !== 'G') continue;
      if (br.nc1 === undefined || br.nc2 === undefined)
        return { ok: false, error: 'VCCS missing control nodes nc1/nc2.' };
      const gm = br.value;
      const uf = unkIdx(br.n1), ut = unkIdx(br.n2);
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

    // ── VCVS (E): Vout = μ·(Vctrl+ − Vctrl−) ─────────────────────────────
    let vcvsIdx = 0;
    for (const br of branches) {
      if (br.type !== 'E') continue;
      if (br.nc1 === undefined || br.nc2 === undefined)
        return { ok: false, error: 'VCVS missing control nodes nc1/nc2.' };
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

    // ── CCCS (F): I_out = β·I_sense ───────────────────────────────────────
    // Control port is wired in series; it acts as a 0 V ammeter.
    // Extra unknown I_sense at col = nFree + nVs + nVcvs + cccsIdx.
    const cccsBase = nFree + nVs + nVcvs;
    let cccsIdx = 0;
    for (const br of branches) {
      if (br.type !== 'F') continue;
      if (br.nc1 === undefined || br.nc2 === undefined)
        return { ok: false, error: 'CCCS missing control nodes nc1/nc2.' };
      const beta = br.value;
      const col  = cccsBase + cccsIdx++;
      const uf   = unkIdx(br.n1),  ut  = unkIdx(br.n2);
      const ucp  = unkIdx(br.nc1), ucm = unkIdx(br.nc2);
      // Sense ammeter (0 V source)
      if (ucp >= 0) { add(ucp, col, 1);  add(col, ucp, 1);  }
      if (ucm >= 0) { add(ucm, col,-1);  add(col, ucm,-1);  }
      bVec[col] = 0;
      // Output current = β × I_sense enters n2, leaves n1
      if (ut >= 0) add(ut,  col,  beta);
      if (uf >= 0) add(uf,  col, -beta);
    }

    // ── CCVS (H): V_out = rm·I_sense ──────────────────────────────────────
    // 2 extra unknowns per instance:
    //   col_s = ccvsBase + 2k     (sense current)
    //   col_o = ccvsBase + 2k + 1 (output VS current)
    const ccvsBase = cccsBase + nCccs;
    let ccvsIdx = 0;
    for (const br of branches) {
      if (br.type !== 'H') continue;
      if (br.nc1 === undefined || br.nc2 === undefined)
        return { ok: false, error: 'CCVS missing control nodes nc1/nc2.' };
      const rm    = br.value;
      const col_s = ccvsBase + 2 * ccvsIdx;
      const col_o = ccvsBase + 2 * ccvsIdx + 1;
      ccvsIdx++;
      const uf  = unkIdx(br.n1),  ut  = unkIdx(br.n2);   // output+ , output−
      const ucp = unkIdx(br.nc1), ucm = unkIdx(br.nc2);  // sense+  , sense−
      // Sense ammeter
      if (ucp >= 0) { add(ucp, col_s, 1);  add(col_s, ucp, 1);  }
      if (ucm >= 0) { add(ucm, col_s,-1);  add(col_s, ucm,-1);  }
      bVec[col_s] = 0;
      // Output VS: V(n1)−V(n2) = rm·I_sense
      if (uf >= 0) { add(uf,  col_o, 1);  add(col_o, uf,  1);  }
      if (ut >= 0) { add(ut,  col_o,-1);  add(col_o, ut, -1);  }
      add(col_o, col_s, -rm);   // KVL: V_out − rm·I_sense = 0
      bVec[col_o] = 0;
    }

    // ── Solve ──────────────────────────────────────────────────────────────
    gaussianElim(A, bVec, dim);

    const node_voltages: number[] = [0, ...bVec.slice(0, nFree)];

    // ── Extract branch currents in input order ─────────────────────────────
    const branch_currents: number[] = [];
    let vi2 = 0, ei2 = 0, fi2 = 0, hi2 = 0;
    for (const br of branches) {
      if (br.type === 'R') {
        const va = node_voltages[br.n1] ?? 0, vb = node_voltages[br.n2] ?? 0;
        branch_currents.push((va - vb) / br.value);
      } else if (br.type === 'V') {
        branch_currents.push(bVec[nFree + vi2++]);
      } else if (br.type === 'I') {
        branch_currents.push(br.value);
      } else if (br.type === 'G') {
        const vcp = node_voltages[br.nc1!] ?? 0, vcm = node_voltages[br.nc2!] ?? 0;
        branch_currents.push(br.value * (vcp - vcm));
      } else if (br.type === 'E') {
        branch_currents.push(bVec[nFree + nVs + ei2++]);
      } else if (br.type === 'F') {
        // Report I_out = β × I_sense
        branch_currents.push(br.value * bVec[cccsBase + fi2++]);
      } else if (br.type === 'H') {
        // Report I_out (the output VS current)
        branch_currents.push(bVec[ccvsBase + 2 * hi2 + 1]);
        hi2++;
      }
    }

    return { ok: true, node_voltages, branch_currents };

  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
