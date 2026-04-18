import type { Schematic } from './types';
import type { CircuitInput } from '../types/circuit';
import { getPin2, gk } from './utils';

// ---------------------------------------------------------------------------
// Geometry helper
// ---------------------------------------------------------------------------

/** Returns true if grid point `pt` lies exactly on the segment from `a` to `b`. */
function onSegment(a: { x: number; y: number }, b: { x: number; y: number }, pt: { x: number; y: number }): boolean {
  // Cross-product zero ⟹ collinear
  if ((b.x - a.x) * (pt.y - a.y) !== (b.y - a.y) * (pt.x - a.x)) return false;
  // Within bounding box
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

  // Wire-on-wire T-junctions: if a wire endpoint lands exactly on another wire
  // segment (not at its endpoints) the two wires share a node there.
  for (const wa of wires) {
    for (const wb of wires) {
      if (wa === wb) continue;
      const aFromKey = gk(wa.from), aToKey = gk(wa.to);
      const bFromKey = gk(wb.from), bToKey = gk(wb.to);
      // Only true T-junctions: endpoint of wa that is NOT already an endpoint of wb
      if (onSegment(wb.from, wb.to, wa.from) && aFromKey !== bFromKey && aFromKey !== bToKey)
        uf.union(aFromKey, bFromKey);
      if (onSegment(wb.from, wb.to, wa.to)   && aToKey   !== bFromKey && aToKey   !== bToKey)
        uf.union(aToKey,   bFromKey);
    }
  }

  // Component-pin T-junctions:
  // A pin that sits in the MIDDLE of a wire segment (not at an endpoint) should
  // join that wire's net.  However, if applying this rule would put both pins of
  // the same component into the same net (short-circuiting it), we skip it —
  // that means the user has placed the component across a single wire, which is
  // unresolvable without them breaking the wire into two segments.
  for (const c of components) {
    const p1Key = gk(c.pin1), p2Key = gk(getPin2(c));

    // Wires where the pin lies strictly inside — not at an endpoint.
    const p1Wires = wires.filter(w =>
      onSegment(w.from, w.to, c.pin1) && gk(w.from) !== p1Key && gk(w.to) !== p1Key
    );
    const p2Wires = wires.filter(w =>
      onSegment(w.from, w.to, getPin2(c)) && gk(w.from) !== p2Key && gk(w.to) !== p2Key
    );

    if (p1Wires.length === 0 && p2Wires.length === 0) continue;

    // Would applying T-junctions merge pin1 and pin2 into the same net?
    const p1Roots = new Set([uf.find(p1Key), ...p1Wires.map(w => uf.find(gk(w.from)))]);
    const p2Roots = new Set([uf.find(p2Key), ...p2Wires.map(w => uf.find(gk(w.from)))]);
    const wouldShort = [...p1Roots].some(r => p2Roots.has(r));

    if (!wouldShort) {
      for (const w of p1Wires) uf.union(p1Key, gk(w.from));
      for (const w of p2Wires) uf.union(p2Key, gk(w.from));
    }
    // If wouldShort: skip — the component sits across a single wire.
    // The user must break the wire into two segments to get distinct nodes.
  }

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
