// ---------------------------------------------------------------------------
// Solution-steps generator.
// Takes a solved CircuitInput + the solved values and produces a list of
// human-readable sections explaining every step of the MNA solution.
// ---------------------------------------------------------------------------

import type { Branch, CircuitInput, DisplayBranchType } from '../types/circuit';

export interface StepLine {
  /** 'eq' → monospace equation; 'ok' → green check; 'warn' → orange; else plain */
  kind: 'text' | 'eq' | 'ok' | 'warn' | 'sep' | 'heading';
  text: string;
}

export interface SolutionSection {
  title: string;
  lines: StepLine[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function fmtV(v: number): string {
  const abs = Math.abs(v);
  if (abs === 0)   return '0 V';
  if (abs >= 1e3)  return (v / 1e3).toPrecision(4)  + ' kV';
  if (abs >= 1)    return v.toPrecision(4)            + ' V';
  if (abs >= 1e-3) return (v * 1e3).toPrecision(4)   + ' mV';
  return               (v * 1e6).toPrecision(4)   + ' µV';
}
function fmtA(i: number): string {
  const abs = Math.abs(i);
  if (abs === 0)   return '0 A';
  if (abs >= 1)    return i.toPrecision(4)            + ' A';
  if (abs >= 1e-3) return (i * 1e3).toPrecision(4)   + ' mA';
  if (abs >= 1e-6) return (i * 1e6).toPrecision(4)   + ' µA';
  return               (i * 1e9).toPrecision(4)   + ' nA';
}
function fmtZ(r: number): string {
  if (r >= 1e6)  return (r / 1e6).toPrecision(4) + ' MΩ';
  if (r >= 1e3)  return (r / 1e3).toPrecision(4) + ' kΩ';
  return r.toPrecision(4) + ' Ω';
}
function fmtSign(v: number): string { return v < 0 ? '−' : '+'; }
function fmtP(w: number): string {
  const abs = Math.abs(w);
  if (abs === 0)    return '0 W';
  if (abs >= 1e3)   return (w / 1e3).toPrecision(4) + ' kW';
  if (abs >= 1)     return w.toPrecision(4) + ' W';
  if (abs >= 1e-3)  return (w * 1e3).toPrecision(4) + ' mW';
  return                   (w * 1e6).toPrecision(4) + ' µW';
}

const CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫'];
function circled(i: number): string { return CIRCLED[i] ?? `(${i + 1})`; }

const ELEMENT_NAMES: Record<DisplayBranchType, string> = {
  R: 'Resistor', V: 'V Source', I: 'I Source',
  G: 'VCCS', E: 'VCVS', F: 'CCCS', H: 'CCVS', A: 'Ammeter',
};
function elementName(dt: DisplayBranchType): string { return ELEMENT_NAMES[dt] ?? dt; }

// ---------------------------------------------------------------------------
// Determine whether a branch's IC follows the VS-like sign convention:
//   IC = current ENTERING n1 from the branch (not leaving).
// VS-like: V, E, H (all have extra MNA unknowns).
// Current-like: R, I, G, F  (IC = current leaving n1 through branch).
// ---------------------------------------------------------------------------
function isVsLike(type: string): boolean {
  return type === 'V' || type === 'E' || type === 'H';
}

// ---------------------------------------------------------------------------
// Signed contribution to "currents leaving node n" KCL sum from branch i.
// ---------------------------------------------------------------------------
function leavingContrib(br: Branch, IC: number, n: number): number {
  const vsL = isVsLike(br.type);
  if (br.n1 === n) return vsL ? -IC : +IC;
  if (br.n2 === n) return vsL ? +IC : -IC;
  return 0;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
export function generateSolutionSteps(
  input:   CircuitInput,
  solved:  { node_voltages: number[]; branch_currents: number[] },
  displayBranches: Branch[],   // same-indexed as input.branches, may have displayType
): SolutionSection[] {
  const { branches, node_count } = input;
  const V  = solved.node_voltages;
  const IC = solved.branch_currents;

  // Map from VS ordinal (vs_ctrl_idx) → branch index in IC array.
  // Needed for CCCS/CCVS which store vs_ctrl_idx, not a direct IC index.
  const vsIdxToBranchIdx = new Map<number, number>();
  let vsOrdinal = 0;
  branches.forEach((br, i) => {
    if (br.type === 'V') vsIdxToBranchIdx.set(vsOrdinal++, i);
  });

  const sections: SolutionSection[] = [];
  const T = (text: string): StepLine => ({ kind: 'text', text });
  const E = (text: string): StepLine => ({ kind: 'eq',   text });
  const O = (text: string): StepLine => ({ kind: 'ok',   text });
  const W = (text: string): StepLine => ({ kind: 'warn', text });
  const S = (): StepLine               => ({ kind: 'sep',  text: '' });
  const H = (text: string): StepLine => ({ kind: 'heading', text });

  // ── 1 · Circuit setup ──────────────────────────────────────────────────────
  {
    const nodeList = Array.from({ length: node_count }, (_, i) =>
      i === 0 ? 'N0 (GND)' : `N${i}`
    ).join('  ·  ');

    const lines: StepLine[] = [
      T(`${node_count} node${node_count !== 1 ? 's' : ''}:  ${nodeList}`),
      T(`${branches.length} branch${branches.length !== 1 ? 'es' : ''}:`),
      S(),
    ];
    branches.forEach((br, i) => {
      const dt = displayBranches[i]?.displayType ?? displayBranches[i]?.type ?? br.type;
      const name = elementName(dt);
      let detail = '';
      if (br.type === 'R') detail = fmtZ(br.value);
      else if (br.type === 'V') detail = fmtV(br.value);
      else if (br.type === 'I') detail = fmtA(br.value);
      else if (br.type === 'G') detail = `gm = ${br.value} S`;
      else if (br.type === 'E') detail = `μ = ${br.value}`;
      else if (br.type === 'F') detail = `β = ${br.value}`;
      else if (br.type === 'H') detail = `rm = ${br.value} Ω`;
      lines.push(E(`  ${circled(i)}  ${name.padEnd(10)} ${detail.padEnd(12)}  N${br.n1} → N${br.n2}`));
    });

    sections.push({ title: '① Circuit Setup', lines });
  }

  // ── 2 · Method introduction ────────────────────────────────────────────────
  {
    const nFree = node_count - 1;
    const nVs   = branches.filter(b => b.type === 'V').length;
    const nVcvs = branches.filter(b => b.type === 'E').length;
    const nHs   = branches.filter(b => b.type === 'H').length;
    const dim   = nFree + nVs + nVcvs + nHs;

    const lines: StepLine[] = [
      T('Using Modified Nodal Analysis (MNA):'),
      T(`  • ${nFree} node equation${nFree !== 1 ? 's' : ''} (KCL at N1…N${nFree})`),
      T(`  • ${nVs}  voltage-source equation${nVs !== 1 ? 's' : ''} (constraint per VS)`),
    ];
    if (nVcvs > 0) lines.push(T(`  • ${nVcvs}  VCVS equation${nVcvs !== 1 ? 's' : ''}`));
    if (nHs   > 0) lines.push(T(`  • ${nHs}  CCVS equation${nHs  !== 1 ? 's' : ''}`));
    lines.push(T(`  → System size: ${dim} × ${dim}`));
    lines.push(S());
    lines.push(T('Ground reference:'));
    lines.push(E('  V(N0) = 0 V  ← fixed reference'));

    sections.push({ title: '② Analysis Method', lines });
  }

  // ── 3 · Per-node equations ─────────────────────────────────────────────────
  {
    const lines: StepLine[] = [];

    // Which nodes are constrained by a voltage source at their n1?
    const vsConstraintAtN1 = new Map<number, { brIdx: number; n2: number; val: number }>();
    branches.forEach((br, i) => {
      if (br.type === 'V') vsConstraintAtN1.set(br.n1, { brIdx: i, n2: br.n2, val: br.value });
    });

    for (let n = 1; n < node_count; n++) {
      lines.push(H(`Node N${n}:`));

      if (vsConstraintAtN1.has(n)) {
        const { brIdx, n2, val } = vsConstraintAtN1.get(n)!;
        const dt = displayBranches[brIdx]?.displayType ?? displayBranches[brIdx]?.type ?? 'V';

        lines.push(T(`  Constrained by ${elementName(dt)} ${circled(brIdx)} — voltage source equation:`));
        if (n2 === 0) {
          lines.push(E(`  V(N${n}) − V(N0) = ${fmtV(val)}`));
          lines.push(E(`  V(N${n}) = ${fmtV(val)}`));
        } else {
          lines.push(E(`  V(N${n}) − V(N${n2}) = ${fmtV(val)}`));
          lines.push(E(`  V(N${n}) = V(N${n2}) + ${fmtV(val)} = ${fmtV(V[n2])} + ${fmtV(val)} = ${fmtV(V[n])}`));
        }

      } else {
        lines.push(T('  KCL — sum of currents leaving this node = 0:'));
        lines.push(S());

        // Collect all branches that touch node n
        interface Contrib { symbolic: string; numeric: string; value: number; }
        const contribs: Contrib[] = [];

        branches.forEach((br, i) => {
          const leav = leavingContrib(br, IC[i], n);
          if (leav === 0 && br.n1 !== n && br.n2 !== n) return;
          if (br.n1 !== n && br.n2 !== n) return;

          const other = br.n1 === n ? br.n2 : br.n1;
          const dt    = displayBranches[i]?.displayType ?? displayBranches[i]?.type ?? br.type;
          const lbl   = `${circled(i)} ${elementName(dt)}`;

          if (br.type === 'R') {
            const Vn = V[n], Vo = V[other];
            const I_r = (Vn - Vo) / br.value;
            const dir = I_r >= 0 ? `leaves → N${other}` : `enters ← N${other}`;
            contribs.push({
              symbolic: `(V(N${n}) − V(N${other})) / ${fmtZ(br.value)}`,
              numeric:  `(${fmtV(Vn)} − ${fmtV(Vo)}) / ${fmtZ(br.value)} = ${fmtA(I_r)}  [${dir}]`,
              value: I_r,
            });

          } else if (br.type === 'I') {
            const leaving = leavingContrib(br, IC[i], n);
            const dir     = leaving >= 0 ? 'current leaves node' : 'current enters node';
            contribs.push({
              symbolic: `${fmtSign(leaving)} ${fmtA(Math.abs(leaving))}  [${lbl}: ${dir}]`,
              numeric:  `${fmtA(leaving)}`,
              value:    leaving,
            });

          } else if (br.type === 'V') {
            const leaving = leavingContrib(br, IC[i], n);
            const dir     = leaving >= 0 ? 'VS draws current out' : 'VS injects current in';
            contribs.push({
              symbolic: `${fmtSign(leaving)} I_${lbl}`,
              numeric:  `${fmtA(leaving)}  [${dir}]`,
              value:    leaving,
            });

          } else {
            // Dependent sources and others
            const leaving = leavingContrib(br, IC[i], n);
            contribs.push({
              symbolic: `${fmtSign(leaving)} I_${lbl}`,
              numeric:  `${fmtA(leaving)}  [${elementName(dt)} output]`,
              value:    leaving,
            });
          }
        });

        if (contribs.length === 0) {
          lines.push(W('  (no branches connected — isolated node)'));
        } else {
          const symW = Math.max(...contribs.map(c => c.symbolic.length));
          contribs.forEach(c => {
            lines.push(E(`  ${c.symbolic.padEnd(symW + 2)}= ${c.numeric}`));
          });
          lines.push(E(`  ${'─'.repeat(52)}`));
          const sum = contribs.reduce((s, c) => s + c.value, 0);
          const ok  = Math.abs(sum) < 1e-8 * (1 + Math.max(...contribs.map(c => Math.abs(c.value))));
          lines.push(ok
            ? O(`  Sum = ${fmtA(sum)}  ✓  KCL satisfied`)
            : W(`  Sum = ${fmtA(sum)}  (numerical residual — should be ≈ 0)`)
          );
        }
      }
      lines.push(S());
    }

    sections.push({ title: '③ Node Equations', lines });
  }

  // ── 4 · Solved node voltages ────────────────────────────────────────────────
  {
    const lines: StepLine[] = V.map((v, i) =>
      O(`  V(N${i}) = ${fmtV(v)}${i === 0 ? '  ← ground reference' : ''}`)
    );
    sections.push({ title: '④ Node Voltages', lines });
  }

  // ── 5 · Branch currents derivation ─────────────────────────────────────────
  {
    const lines: StepLine[] = [];

    branches.forEach((br, i) => {
      const cur = IC[i];
      const dt  = displayBranches[i]?.displayType ?? displayBranches[i]?.type ?? br.type;
      const lbl = `${circled(i)} ${elementName(dt)}  (N${br.n1}→N${br.n2})`;
      lines.push(H(lbl));

      if (br.type === 'R') {
        lines.push(E(`  I = (V(N${br.n1}) − V(N${br.n2})) / R`));
        lines.push(E(`    = (${fmtV(V[br.n1])} − ${fmtV(V[br.n2])}) / ${fmtZ(br.value)}`));
        lines.push(O(`    = ${fmtA(cur)}`));

      } else if (br.type === 'I') {
        lines.push(T('  Defined by independent current source.'));
        lines.push(O(`  I = ${fmtA(cur)}`));

      } else if (br.type === 'V') {
        const dispT = displayBranches[i]?.displayType;
        if (dispT === 'A') {
          lines.push(T('  Current Probe (0 V series ammeter). I is MNA extra unknown.'));
        } else {
          lines.push(T('  Independent voltage source. I is MNA extra unknown (solved by KCL).'));
        }
        lines.push(O(`  I = ${fmtA(cur)}`));

      } else if (br.type === 'G') {
        const vc  = V[br.nc1!] - V[br.nc2!];
        lines.push(E(`  I = gm · (V(N${br.nc1}) − V(N${br.nc2}))`));
        lines.push(E(`    = ${br.value} × (${fmtV(V[br.nc1!])} − ${fmtV(V[br.nc2!])}) = ${br.value} × ${fmtV(vc)}`));
        lines.push(O(`    = ${fmtA(cur)}`));

      } else if (br.type === 'E') {
        const vc = V[br.nc1!] - V[br.nc2!];
        lines.push(E(`  V_out = μ · (V(N${br.nc1}) − V(N${br.nc2})) = ${br.value} × ${fmtV(vc)}`));
        lines.push(T('  I is MNA extra unknown (solved from KCL at output terminals).'));
        lines.push(O(`  I = ${fmtA(cur)}`));

      } else if (br.type === 'F') {
        const ctrlBranchIdx = vsIdxToBranchIdx.get(br.vs_ctrl_idx!);
        const I_ctrl = ctrlBranchIdx !== undefined ? IC[ctrlBranchIdx] : 0;
        lines.push(E(`  I = β · I_ctrl = ${br.value} × ${fmtA(I_ctrl)}`));
        lines.push(O(`    = ${fmtA(cur)}`));

      } else if (br.type === 'H') {
        const ctrlBranchIdx = vsIdxToBranchIdx.get(br.vs_ctrl_idx!);
        const I_ctrl = ctrlBranchIdx !== undefined ? IC[ctrlBranchIdx] : 0;
        lines.push(E(`  V_out = rm · I_ctrl = ${br.value} Ω × ${fmtA(I_ctrl)}`));
        lines.push(T('  I is MNA extra unknown.'));
        lines.push(O(`  I = ${fmtA(cur)}`));

      } else {
        lines.push(O(`  I = ${fmtA(cur)}`));
      }

      lines.push(S());
    });

    sections.push({ title: '⑤ Branch Currents', lines });
  }

  // ── 6 · Power balance ──────────────────────────────────────────────────────
  {
    const lines: StepLine[] = [];
    let totalDelivered = 0, totalAbsorbed = 0;

    branches.forEach((br, i) => {
      const cur = IC[i];
      const Vn1 = V[br.n1], Vn2 = V[br.n2];
      const Vdiff = Vn1 - Vn2;
      const dt  = displayBranches[i]?.displayType ?? displayBranches[i]?.type ?? br.type;

      // Power = V_branch × I_branch
      // For R: P = (V_n1 - V_n2) * I = V_diff * I (absorbed)
      // For VS-like: I enters n1 from branch, so the branch delivers power if it pushes I into n1 at higher potential?
      //   P_delivered = V_branch * I_branch (external perspective)
      //   For VS: V_n1 - V_n2 = Vs, I_vs = current entering n1 from VS = source delivers current into n1
      //   P_delivered = Vs * I_vs (if both positive, VS delivers power)
      const P = Vdiff * (isVsLike(br.type) ? -cur : cur);
      const name = `${circled(i)} ${elementName(dt).padEnd(10)}`;
      const pStr = `P = ${fmtV(Vdiff)} × ${fmtA(isVsLike(br.type) ? -cur : cur)} = ${fmtP(P)}`;

      if (P < -1e-14) {
        lines.push(E(`  ${name}  ${pStr}  [delivers ${fmtP(Math.abs(P))}]`));
        totalDelivered += Math.abs(P);
      } else if (P > 1e-14) {
        lines.push(E(`  ${name}  ${pStr}  [absorbs  ${fmtP(P)}]`));
        totalAbsorbed += P;
      } else {
        lines.push(E(`  ${name}  P ≈ 0 W`));
      }
    });

    if (branches.length > 0) {
      lines.push(S());
      const diff = Math.abs(totalDelivered - totalAbsorbed);
      const ok   = diff < 1e-8 * (1 + totalDelivered);
      lines.push(T(`  Delivered: ${fmtP(totalDelivered)}`));
      lines.push(T(`  Absorbed:  ${fmtP(totalAbsorbed)}`));
      lines.push(ok
        ? O('  Power balance ✓  (delivered = absorbed)')
        : W(`  Power imbalance: ${fmtP(diff)} (numerical residual)`)
      );
    }

    sections.push({ title: '⑥ Power Balance', lines });
  }

  return sections;
}
