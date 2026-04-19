import type { Schematic, PlacedComponent } from './types';
import type { CircuitInput, Branch, BranchType } from '../types/circuit';
import { getPin2, allPinsOf, gk } from './utils';

// ---------------------------------------------------------------------------
// Geometry helper
// ---------------------------------------------------------------------------

/** Returns true if grid point `pt` lies exactly on the segment from `a` to `b`. */
function onSegment(
  a:  { x: number; y: number },
  b:  { x: number; y: number },
  pt: { x: number; y: number },
): boolean {
  if ((b.x - a.x) * (pt.y - a.y) !== (b.y - a.y) * (pt.x - a.x)) return false;
  return pt.x >= Math.min(a.x, b.x) && pt.x <= Math.max(a.x, b.x)
      && pt.y >= Math.min(a.y, b.y) && pt.y <= Math.max(a.y, b.y);
}

// ---------------------------------------------------------------------------
// Union-Find (path-compressed, rank-based)
// ---------------------------------------------------------------------------
function makeUF() {
  const parent = new Map<string, string>();
  const rank   = new Map<string, number>();

  function find(k: string): string {
    if (!parent.has(k)) { parent.set(k, k); rank.set(k, 0); }
    if (parent.get(k) !== k) parent.set(k, find(parent.get(k)!));
    return parent.get(k)!;
  }

  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    const da = rank.get(ra)!, db = rank.get(rb)!;
    if (da < db)       parent.set(ra, rb);
    else if (da > db)  parent.set(rb, ra);
    else { parent.set(rb, ra); rank.set(ra, da + 1); }
  }

  return { find, union };
}

// ---------------------------------------------------------------------------
// Core conversion logic
// ---------------------------------------------------------------------------
export interface NetlistWithNodeMap {
  netlist:   CircuitInput;
  /** gk(pin) → node ID for every component pin and wire endpoint. */
  pinToNode: Map<string, number>;
}

export function schematicToNetlistWithNodeMap(schematic: Schematic): NetlistWithNodeMap {
  const { components, wires, labels, groundPoint } = schematic;

  if (components.length === 0)
    throw new Error('No components placed. Add at least one element to the canvas.');

  const uf = makeUF();

  // 1. Seed every component pin — all components are now 2-terminal (allPinsOf
  //    returns [pin1, pin2] since hasCtrlPins always returns false).
  for (const c of components) {
    for (const pin of allPinsOf(c)) uf.find(gk(pin));
  }
  for (const w of wires)  { uf.find(gk(w.from)); uf.find(gk(w.to)); }
  for (const l of labels) uf.find(gk(l.point));

  // 2. Union wire endpoints
  for (const w of wires) uf.union(gk(w.from), gk(w.to));

  // 3. Wire-on-wire T-junctions
  for (const wa of wires) {
    for (const wb of wires) {
      if (wa === wb) continue;
      const aFromKey = gk(wa.from), aToKey = gk(wa.to);
      const bFromKey = gk(wb.from), bToKey = gk(wb.to);
      if (onSegment(wb.from, wb.to, wa.from) && aFromKey !== bFromKey && aFromKey !== bToKey)
        uf.union(aFromKey, bFromKey);
      if (onSegment(wb.from, wb.to, wa.to)   && aToKey   !== bFromKey && aToKey   !== bToKey)
        uf.union(aToKey,   bFromKey);
    }
  }

  // 4. Component-pin T-junctions (with short-circuit guard).
  for (const c of components) {
    const pins    = allPinsOf(c);
    const pinKeys = pins.map(p => gk(p));

    const pinWires = pins.map((pin, pi) =>
      wires.filter(w =>
        onSegment(w.from, w.to, pin)
          && gk(w.from) !== pinKeys[pi]
          && gk(w.to)   !== pinKeys[pi]
      )
    );

    const anyTJunction = pinWires.some(pw => pw.length > 0);
    if (!anyTJunction) continue;

    const pinRoots = pins.map((pin, pi) => {
      const s = new Set([uf.find(pinKeys[pi])]);
      for (const w of pinWires[pi]) s.add(uf.find(gk(w.from)));
      return s;
    });

    let wouldShort = false;
    for (let a = 0; a < pinRoots.length && !wouldShort; a++)
      for (let b = a + 1; b < pinRoots.length && !wouldShort; b++)
        wouldShort = [...pinRoots[a]].some(r => pinRoots[b].has(r));

    if (!wouldShort)
      for (let pi = 0; pi < pins.length; pi++)
        for (const w of pinWires[pi]) uf.union(pinKeys[pi], gk(w.from));
  }

  // 5. Wire-label net merging
  const labelGroups = new Map<string, string[]>();
  for (const lbl of labels) {
    const t = lbl.text.trim();
    if (!t) continue;
    if (!labelGroups.has(t)) labelGroups.set(t, []);
    labelGroups.get(t)!.push(gk(lbl.point));
  }
  for (const [, keys] of labelGroups)
    for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i]);

  // 6. Assign integer node numbers (ground root → 0)
  const nodeMap    = new Map<string, number>();
  const groundRoot = groundPoint
    ? uf.find(gk(groundPoint))
    : uf.find(gk(components[0].pin1));
  nodeMap.set(groundRoot, 0);

  let nextNode = 1;
  for (const c of components) {
    for (const pin of allPinsOf(c)) {
      const root = uf.find(gk(pin));
      if (!nodeMap.has(root)) nodeMap.set(root, nextNode++);
    }
  }
  for (const lbl of labels) {
    const root = uf.find(gk(lbl.point));
    if (!nodeMap.has(root)) nodeMap.set(root, nextNode++);
  }

  const nodeOfKey = (key: string): number | undefined => nodeMap.get(uf.find(key));
  const nodeOf = (pin: { x: number; y: number }): number => {
    const n = nodeOfKey(gk(pin));
    if (n === undefined)
      throw new Error(
        `Pin at (${pin.x}, ${pin.y}) is not connected to any node. ` +
        `Connect all component pins with wires.`
      );
    return n;
  };

  // ---------------------------------------------------------------------------
  // Dependent-source resolution helpers
  // ---------------------------------------------------------------------------

  // Build varName → component lookup
  const varNameMap = new Map<string, PlacedComponent>();
  for (const c of components) {
    const vn = c.varName?.trim();
    if (vn) {
      if (varNameMap.has(vn))
        throw new Error(`Duplicate variable name "${vn}". Each component must have a unique label.`);
      varNameMap.set(vn, c);
    }
  }

  // Pre-compute VS branch order (needed for vs_ctrl_idx).
  // Both 'V' (voltage source) and 'A' (current probe = 0 V source) emit V branches.
  const vsOrder = new Map<string, number>(); // componentId → VS index among V branches
  let vsIdx = 0;
  for (const c of components) {
    if (c.type === 'V' || c.type === 'A') vsOrder.set(c.id, vsIdx++);
  }

  /** Resolve a dependent source's controlling component, validating it exists. */
  function resolveCtrl(c: PlacedComponent): PlacedComponent {
    const cv = c.controlVar?.trim();
    if (!cv)
      throw new Error(
        `Dependent source (${c.type}) has no control variable. ` +
        `Click the component twice and set the "Control" field.`
      );
    const ctrl = varNameMap.get(cv);
    if (!ctrl)
      throw new Error(
        `Control variable "${cv}" not found. ` +
        `Label a component with that name using its inline editor.`
      );
    return ctrl;
  }

  // ---------------------------------------------------------------------------
  // 7. Build branches
  // ---------------------------------------------------------------------------
  const branches: Branch[] = [];

  for (const c of components) {
    if (c.type === 'OC') continue; // open circuit — no branch

    const n1 = nodeOf(c.pin1);
    const n2 = nodeOf(getPin2(c));

    // ── Independent elements ──────────────────────────────────────────────
    if (c.type === 'R' || c.type === 'V' || c.type === 'I') {
      branches.push({ type: c.type, n1, n2, value: c.value });
      continue;
    }

    // ── Current Probe (ammeter, 0 V series source) ────────────────────────
    // Emitted as a voltage source with value=0 so the MNA current unknown
    // is available for CCCS/CCVS to reference via vs_ctrl_idx.
    if (c.type === 'A') {
      branches.push({ type: 'V', n1, n2, value: 0, displayType: 'A' });
      continue;
    }

    // ── Voltage-controlled sources (G / E) ────────────────────────────────
    if (c.type === 'G' || c.type === 'E') {
      const ctrl = resolveCtrl(c);
      const nc1  = nodeOf(ctrl.pin1);
      const nc2  = nodeOf(getPin2(ctrl));
      branches.push({ type: c.type, n1, n2, value: c.value, nc1, nc2 });
      continue;
    }

    // ── Current-controlled sources (F / H) ────────────────────────────────
    if (c.type === 'F' || c.type === 'H') {
      const ctrl = resolveCtrl(c);

      if (ctrl.type === 'R') {
        // Current through resistor = V_ctrl / R
        // → equivalent to voltage-controlled with gain/R
        // Emit as G/E (solver already handles these) but keep displayType = F/H
        const nc1      = nodeOf(ctrl.pin1);
        const nc2      = nodeOf(getPin2(ctrl));
        const gainEff  = c.value / ctrl.value;
        const solveType: BranchType = c.type === 'F' ? 'G' : 'E';
        branches.push({
          type: solveType, n1, n2, value: gainEff, nc1, nc2,
          displayType: c.type,
        });
        continue;
      }

      if (ctrl.type === 'V' || ctrl.type === 'A') {
        // Current through a VS or Current Probe = MNA extra unknown at nFree + vs_ctrl_idx
        const vi = vsOrder.get(ctrl.id);
        if (vi === undefined)
          throw new Error(`Could not find voltage/probe "${ctrl.varName}" in netlist.`);
        branches.push({ type: c.type, n1, n2, value: c.value, vs_ctrl_idx: vi });
        continue;
      }

      throw new Error(
        `${c.type === 'F' ? 'CCCS' : 'CCVS'} (controlVar="${c.controlVar}") references ` +
        `a ${ctrl.type} component. Current-controlled sources must reference a ` +
        `Current Probe (A), Resistor (I = V/R), or Voltage Source.`
      );
    }
  }

  if (!groundPoint)
    console.warn('[toNetlist] No ground set – auto-assigned node 0 to first component pin.');

  // 8. Build pinToNode map for canvas overlays
  const pinToNode = new Map<string, number>();
  const recordPin = (pt: { x: number; y: number }) => {
    const key = gk(pt);
    const n = nodeOfKey(key);
    if (n !== undefined) pinToNode.set(key, n);
  };
  for (const c of components) for (const pin of allPinsOf(c)) recordPin(pin);
  for (const w of wires) { recordPin(w.from); recordPin(w.to); }
  for (const l of labels) recordPin(l.point);

  return {
    netlist:   { node_count: nextNode, branches },
    pinToNode,
  };
}

/** Convenience wrapper — returns only the netlist. */
export function schematicToNetlist(schematic: Schematic): CircuitInput {
  return schematicToNetlistWithNodeMap(schematic).netlist;
}
