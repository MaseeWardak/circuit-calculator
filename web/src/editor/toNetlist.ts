import type { Schematic } from './types';
import type { CircuitInput } from '../types/circuit';
import { getPin2, getCtrlPin1, getCtrlPin2, hasCtrlPins, allPinsOf, gk } from './utils';

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

  // 1. Seed every component pin (including ctrl pins for G/E)
  for (const c of components) {
    for (const pin of allPinsOf(c)) uf.find(gk(pin));
  }
  // Seed wire endpoints
  for (const w of wires) {
    uf.find(gk(w.from));
    uf.find(gk(w.to));
  }
  // Seed label anchor points
  for (const lbl of labels) uf.find(gk(lbl.point));

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
  //    Applied to ALL electrically significant pins (incl. ctrl pins for G/E).
  for (const c of components) {
    const pins = allPinsOf(c);
    const pinKeys = pins.map(p => gk(p));

    // For each pin: which wire segments contain it strictly inside?
    const pinWires = pins.map((pin, pi) =>
      wires.filter(w =>
        onSegment(w.from, w.to, pin)
          && gk(w.from) !== pinKeys[pi]
          && gk(w.to)   !== pinKeys[pi]
      )
    );

    const anyTJunction = pinWires.some(pw => pw.length > 0);
    if (!anyTJunction) continue;

    // Would merging short-circuit any pair of this component's pins?
    const pinRoots = pins.map((pin, pi) => {
      const s = new Set([uf.find(pinKeys[pi])]);
      for (const w of pinWires[pi]) s.add(uf.find(gk(w.from)));
      return s;
    });

    let wouldShort = false;
    for (let a = 0; a < pinRoots.length && !wouldShort; a++)
      for (let b = a + 1; b < pinRoots.length && !wouldShort; b++)
        wouldShort = [...pinRoots[a]].some(r => pinRoots[b].has(r));

    if (!wouldShort) {
      for (let pi = 0; pi < pins.length; pi++)
        for (const w of pinWires[pi]) uf.union(pinKeys[pi], gk(w.from));
    }
  }

  // 5. Wire-label net merging: any two labels with the same text get unioned.
  const labelGroups = new Map<string, string[]>();
  for (const lbl of labels) {
    const trimmed = lbl.text.trim();
    if (!trimmed) continue;
    if (!labelGroups.has(trimmed)) labelGroups.set(trimmed, []);
    labelGroups.get(trimmed)!.push(gk(lbl.point));
  }
  for (const [, keys] of labelGroups) {
    for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i]);
  }

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

  const nodeOfKey = (key: string): number | undefined => {
    const root = uf.find(key);
    return nodeMap.get(root);
  };
  const nodeOf = (pin: { x: number; y: number }): number => {
    const n = nodeOfKey(gk(pin));
    if (n === undefined)
      throw new Error(
        `Pin at (${pin.x}, ${pin.y}) is not connected to any node. ` +
        `Connect all component pins with wires.`
      );
    return n;
  };

  // 7. Generate branches (skip OC — they have no branch in the netlist)
  const branches = components
    .filter(c => c.type !== 'OC')
    .map(c => {
      const base = {
        type:  c.type as import('../types/circuit').BranchType,
        n1:    nodeOf(c.pin1),
        n2:    nodeOf(getPin2(c)),
        value: c.value,
      };
      if (hasCtrlPins(c.type)) {
        return {
          ...base,
          nc1: nodeOf(getCtrlPin1(c)),
          nc2: nodeOf(getCtrlPin2(c)),
        };
      }
      return base;
    });

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
  for (const lbl of labels) recordPin(lbl.point);

  return {
    netlist:   { node_count: nextNode, branches },
    pinToNode,
  };
}

/** Convenience wrapper — returns only the netlist. */
export function schematicToNetlist(schematic: Schematic): CircuitInput {
  return schematicToNetlistWithNodeMap(schematic).netlist;
}
