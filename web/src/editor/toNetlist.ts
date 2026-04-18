import type { Schematic } from './types';
import type { CircuitInput } from '../types/circuit';
import { getPin2, gk } from './utils';

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
// Returns the solver netlist AND a map from every pin grid-key → node ID,
// which the canvas uses to draw node voltage overlays.
// ---------------------------------------------------------------------------
export interface NetlistWithNodeMap {
  netlist:   CircuitInput;
  /** gk(pin) → node ID for every component pin (and wire endpoint). */
  pinToNode: Map<string, number>;
}

export function schematicToNetlistWithNodeMap(schematic: Schematic): NetlistWithNodeMap {
  const { components, wires, groundPoint } = schematic;

  if (components.length === 0)
    throw new Error('No components placed. Add at least one element to the canvas.');

  const uf = makeUF();

  // Seed every pin
  for (const c of components) {
    uf.find(gk(c.pin1));
    uf.find(gk(getPin2(c)));
  }
  // Seed wire endpoints
  for (const w of wires) {
    uf.find(gk(w.from));
    uf.find(gk(w.to));
  }

  // Union wire endpoints
  for (const w of wires) uf.union(gk(w.from), gk(w.to));

  // Assign integer node numbers (ground root → 0)
  const nodeMap = new Map<string, number>();
  const groundRoot = groundPoint
    ? uf.find(gk(groundPoint))
    : uf.find(gk(components[0].pin1));
  nodeMap.set(groundRoot, 0);

  let nextNode = 1;
  for (const c of components) {
    for (const pin of [c.pin1, getPin2(c)]) {
      const root = uf.find(gk(pin));
      if (!nodeMap.has(root)) nodeMap.set(root, nextNode++);
    }
  }

  // Helper: grid-key → node ID
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

  const branches = components.map(c => ({
    type:  c.type,
    n1:    nodeOf(c.pin1),
    n2:    nodeOf(getPin2(c)),
    value: c.value,
  }));

  if (!groundPoint)
    console.warn('[toNetlist] No ground set – auto-assigned node 0 to first component pin.');

  // Build pinToNode for every component pin and wire endpoint
  const pinToNode = new Map<string, number>();
  for (const c of components) {
    for (const pin of [c.pin1, getPin2(c)]) {
      const key = gk(pin);
      const n = nodeOfKey(key);
      if (n !== undefined) pinToNode.set(key, n);
    }
  }
  for (const w of wires) {
    for (const pt of [w.from, w.to]) {
      const key = gk(pt);
      const n = nodeOfKey(key);
      if (n !== undefined) pinToNode.set(key, n);
    }
  }

  return {
    netlist:   { node_count: nextNode, branches },
    pinToNode,
  };
}

/** Convenience wrapper — returns only the netlist. */
export function schematicToNetlist(schematic: Schematic): CircuitInput {
  return schematicToNetlistWithNodeMap(schematic).netlist;
}
