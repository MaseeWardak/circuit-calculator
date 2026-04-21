import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ComponentType, GridPoint, PlacedComponent, Schematic, ToolType, Wire, WireLabel,
} from './types';
import type { Branch } from '../types/circuit';
import { ComponentShape, GroundSymbol } from './ComponentShape';
import {
  CANVAS_COLS, CANVAS_H, CANVAS_ROWS, CANVAS_W,
  COMP_PX, GRID, NODE_COLORS, PIN_R,
} from './constants';
import {
  allPinsOf, formatValue, voltageToColor,
  getPin2, gk, gridEq, hasCtrlPins, snapToGrid, toScreen,
} from './utils';

function uid(): string { return crypto.randomUUID(); }

// ── Visualization helpers ────────────────────────────────────────────────────

/**
 * Compute per-component-pin outward current (positive = current exits pin into wire).
 * Convention follows MNA branch current sign:
 *   V-source-like (V, E, H, A→V): pin1 = +I, pin2 = −I
 *   Current-source-like (R, I, G, F): pin1 = −I, pin2 = +I
 */
function computePinFlows(
  components: PlacedComponent[],
  netlistBranches: Branch[],
  branchCurrents: number[],
): Map<string, number> {
  const map = new Map<string, number>();
  let brIdx = 0;
  for (const c of components) {
    if (c.type === 'OC') continue;
    const I  = branchCurrents[brIdx] ?? 0;
    const br = netlistBranches[brIdx];
    brIdx++;

    if (!br || Math.abs(I) < 1e-15) continue;
    const p1k = gk(c.pin1);
    const p2k = gk(getPin2(c));
    const bt  = br.type;
    // V, E, H are voltage-source-like (extra unknown = current entering n1)
    const vsLike = bt === 'V' || bt === 'E' || bt === 'H';
    map.set(p1k, (map.get(p1k) ?? 0) + (vsLike ? +I : -I));
    map.set(p2k, (map.get(p2k) ?? 0) + (vsLike ? -I : +I));
  }
  return map;
}

/**
 * Determine flow direction (+1 = from→to, −1 = to→from, 0 = unknown) for every wire.
 * Uses component-pin currents at wire endpoints, then propagates via BFS through
 * wire chains where neither endpoint is a component pin.
 */
function computeWireFlows(
  wires: Wire[],
  pinFlows: Map<string, number>,
): Map<string, number> {
  const flow = new Map<string, number>();

  // Pass 1: wires with at least one component-pin endpoint
  for (const w of wires) {
    const fOut = pinFlows.get(gk(w.from)) ?? 0;
    const tOut = pinFlows.get(gk(w.to))   ?? 0;
    if (Math.abs(fOut) > 1e-15) {
      flow.set(w.id, fOut > 0 ? 1 : -1);
    } else if (Math.abs(tOut) > 1e-15) {
      flow.set(w.id, tOut > 0 ? -1 : 1);
    }
  }

  // Pass 2: BFS propagation through intermediate wire segments
  const epWires = new Map<string, Array<{ w: Wire; isFrom: boolean }>>();
  for (const w of wires) {
    const fk = gk(w.from), tk = gk(w.to);
    if (!epWires.has(fk)) epWires.set(fk, []);
    if (!epWires.has(tk)) epWires.set(tk, []);
    epWires.get(fk)!.push({ w, isFrom: true });
    epWires.get(tk)!.push({ w, isFrom: false });
  }

  const queue = [...flow.keys()];
  const visited = new Set<string>(queue);
  while (queue.length > 0) {
    const wid   = queue.shift()!;
    const w     = wires.find(x => x.id === wid);
    if (!w) continue;
    const dir   = flow.get(wid)!;
    const exitK = dir > 0 ? gk(w.to) : gk(w.from);
    for (const { w: adj, isFrom } of (epWires.get(exitK) ?? [])) {
      if (visited.has(adj.id)) continue;
      flow.set(adj.id, isFrom ? 1 : -1);
      visited.add(adj.id);
      queue.push(adj.id);
    }
  }

  return flow;
}

type Rotation = 0 | 90 | 180 | 270;
function nextRotation(r: Rotation): Rotation {
  return (r === 0 ? 90 : r === 90 ? 180 : r === 180 ? 270 : 0) as Rotation;
}

/**
 * Returns the value-label offset (screen px) relative to pin1's screen coord.
 *
 * For 4-terminal components the control leads extend ±40 px perpendicular to
 * the main axis.  The label is placed 12 px clear of those leads so it never
 * overlaps the component body.
 *
 * 0°  — ctrl leads go UP/DOWN  → label above ctrl+ (dy = −54)
 * 90° — ctrl leads go LEFT/RIGHT (after rotation) → label to the right (dx = 54)
 * 180° — same as 0° mirrored  → label above ctrl- (dy = −54)
 * 270° — same as 90° mirrored → label to the right (dx = 54)
 */
function labelOffset(
  rotation: Rotation,
  type: ComponentType,
): { dx: number; dy: number } {
  const is4T = hasCtrlPins(type);
  switch (rotation) {
    case   0: return { dx:  COMP_PX / 2, dy: is4T ? -54 : -20 };
    case  90: return { dx:  is4T ? 54 : 26, dy:  COMP_PX / 2 };
    case 180: return { dx: -COMP_PX / 2, dy: is4T ? -54 : -20 };
    case 270: return { dx:  is4T ? 54 : 26, dy: -COMP_PX / 2 };
  }
}

function defaultValue(type: ComponentType): number {
  switch (type) {
    case 'R':  return 1000;
    case 'V':  return 5;
    case 'I':  return 0.001;
    case 'G':  return 0.01;
    case 'E':  return 2;
    case 'F':  return 50;
    case 'H':  return 1000;
    case 'OC': return 0;
    case 'A':  return 0;
  }
}

function fmtShortV(v: number): string {
  const abs = Math.abs(v);
  if (abs === 0)   return '0 V';
  if (abs >= 1e3)  return (v / 1e3).toPrecision(3) + ' kV';
  if (abs >= 1)    return v.toPrecision(3) + ' V';
  if (abs >= 1e-3) return (v * 1e3).toPrecision(3) + ' mV';
  return                  (v * 1e6).toPrecision(3) + ' µV';
}

function inlineEditorLabel(type: ComponentType): string {
  switch (type) {
    case 'R':  return 'Resistance';
    case 'V':  return 'Voltage';
    case 'I':  return 'Current';
    case 'G':  return 'gm (S)';
    case 'E':  return 'Gain μ (×)';
    case 'F':  return 'Gain β (×)';
    case 'H':  return 'Gain rm (×)';
    case 'OC': return 'Open Circuit';
    case 'A':  return 'Current Probe';
  }
}

function inlineEditorUnit(type: ComponentType): string {
  switch (type) {
    case 'R':  return 'Ω';
    case 'V':  return 'V';
    case 'I':  return 'A';
    case 'G':  return 'S';
    case 'E':  return '×';
    case 'F':  return '×';
    case 'H':  return '×';
    case 'OC': return '';
    case 'A':  return '';
  }
}

const SEL_COLOR  = '#B8860B';
const WIRE_COLOR = '#B8860B';

interface DragState {
  id:             string;
  startMouseGrid: GridPoint;
  startPin1:      GridPoint;
  dragging:       boolean;
}

interface Props {
  schematic:           Schematic;
  onChange:            (s: Schematic) => void;
  pendingType:         ToolType | null;
  onPendingTypeChange: (t: ToolType | null) => void;
  nodeHighlights?:     Map<string, number> | null;
  nodeVoltages?:       number[] | null;
  placementHint?:      string;
  // Visualization overlay
  animateMode?:        boolean;
  branchCurrents?:     number[] | null;
  netlistBranches?:    Branch[] | null;
}

export default function EditorCanvas({
  schematic, onChange, pendingType, onPendingTypeChange,
  nodeHighlights, nodeVoltages, placementHint,
  animateMode, branchCurrents, netlistBranches,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [mouseGrid, setMouseGrid]         = useState<GridPoint | null>(null);
  const [wiringFrom, setWiringFrom]       = useState<GridPoint | null>(null);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [pendingRot, setPendingRot]       = useState<Rotation>(0);
  const [dragState, setDragState]         = useState<DragState | null>(null);
  const [hoveredPinKey, setHoveredPinKey] = useState<string | null>(null);

  const mouseGridRef     = useRef<GridPoint | null>(null);
  const dragStateRef     = useRef<DragState | null>(null);
  const schematicRef     = useRef<Schematic>(schematic);
  const selectedIdRef    = useRef<string | null>(null);
  const wasAlreadySel    = useRef(false);
  mouseGridRef.current   = mouseGrid;
  dragStateRef.current   = dragState;
  schematicRef.current   = schematic;
  selectedIdRef.current  = selectedId;

  // ── Visualization data ─────────────────────────────────────────────────────

  const vMin = nodeVoltages ? Math.min(...nodeVoltages) : 0;
  const vMax = nodeVoltages ? Math.max(...nodeVoltages) : 0;

  // Per-pin outward currents (needed for wire flow direction)
  const pinFlows = useMemo(() =>
    animateMode && branchCurrents && netlistBranches
      ? computePinFlows(schematic.components, netlistBranches, branchCurrents)
      : new Map<string, number>(),
    [animateMode, branchCurrents, netlistBranches, schematic.components],
  );

  // Per-wire flow direction: +1 from→to, −1 to→from, 0 unknown
  const wireFlows = useMemo(() =>
    animateMode ? computeWireFlows(schematic.wires, pinFlows) : new Map<string, number>(),
    [animateMode, schematic.wires, pinFlows],
  );

  // Per-component branch current (for current direction arrows)
  const componentCurrents = useMemo(() => {
    if (!animateMode || !branchCurrents) return new Map<string, number>();
    const map = new Map<string, number>();
    let brIdx = 0;
    for (const c of schematic.components) {
      if (c.type === 'OC') continue;
      map.set(c.id, branchCurrents[brIdx++] ?? 0);
    }
    return map;
  }, [animateMode, branchCurrents, schematic.components]);

  // ── helpers ───────────────────────────────────────────────────────────────

  const getSvgPoint = useCallback((e: React.MouseEvent | MouseEvent): GridPoint | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return snapToGrid(e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  /** All pin positions across all components (incl. ctrl pins for G/E). */
  const allPins = (sc = schematic) =>
    sc.components.flatMap(c =>
      allPinsOf(c).map(pt => ({ pt, componentId: c.id }))
    );

  const pinAt = (pt: GridPoint, sc = schematic) =>
    allPins(sc).find(p => gridEq(p.pt, pt)) ?? null;

  const getDragPreviewPin1 = (ds: DragState, mg: GridPoint): GridPoint => ({
    x: ds.startPin1.x + mg.x - ds.startMouseGrid.x,
    y: ds.startPin1.y + mg.y - ds.startMouseGrid.y,
  });

  // ── commit drag ───────────────────────────────────────────────────────────

  const commitDrag = useCallback((ds: DragState, mg: GridPoint) => {
    const sc = schematicRef.current;
    const c  = sc.components.find(x => x.id === ds.id);
    if (!c) return;

    const newPin1 = getDragPreviewPin1(ds, mg);
    // Validate bounds against all pins (incl. ctrl pins)
    const previewComp = { ...c, pin1: newPin1 };
    const pinPts = allPinsOf(previewComp);
    const xs = pinPts.map(p => p.x), ys = pinPts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    if (minX < 0 || minY < 0 || maxX > CANVAS_COLS || maxY > CANVAS_ROWS) return;

    const oldPins = allPinsOf(c);
    const newPins = allPinsOf(previewComp);
    const moveEnd = (pt: GridPoint): GridPoint => {
      for (let i = 0; i < oldPins.length; i++)
        if (gridEq(pt, oldPins[i])) return newPins[i];
      return pt;
    };

    onChange({
      ...sc,
      components: sc.components.map(x => x.id === ds.id ? { ...x, pin1: newPin1 } : x),
      wires:      sc.wires.map(w => ({ ...w, from: moveEnd(w.from), to: moveEnd(w.to) })),
    });
    setSelectedId(ds.id);
    setEditingId(null);
  }, [onChange]);

  // ── global mouseup ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!dragState) return;
    const onGlobalUp = () => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const mg = mouseGridRef.current;
      if (ds.dragging && mg) {
        commitDrag(ds, mg);
      } else if (!ds.dragging) {
        if (wasAlreadySel.current) {
          setSelectedId(ds.id);
          setEditingId(ds.id);
        } else {
          setSelectedId(prev => prev === ds.id ? null : ds.id);
          setEditingId(null);
        }
      }
      setDragState(null);
    };
    window.addEventListener('mouseup', onGlobalUp);
    return () => window.removeEventListener('mouseup', onGlobalUp);
  }, [!!dragState, commitDrag]);

  // ── keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      if (e.key === 'Escape') {
        if (editingId || editingLabelId) { setEditingId(null); setEditingLabelId(null); return; }
        onPendingTypeChange(null);
        setWiringFrom(null);
        setSelectedId(null);
        setDragState(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        onChange({
          ...schematic,
          components: schematic.components.filter(c => c.id !== selectedId),
          wires: schematic.wires.filter(
            w => !pinAt(w.from)?.componentId.startsWith(selectedId) &&
                 !pinAt(w.to)?.componentId.startsWith(selectedId)
          ),
        });
        setSelectedId(null);
        setEditingId(null);
        return;
      }
      if (e.key === 'Enter' && selectedId && !editingId) {
        setEditingId(selectedId);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (pendingType && pendingType !== 'L') { setPendingRot(r => nextRotation(r)); return; }
        if (selectedId) {
          onChange({
            ...schematic,
            components: schematic.components.map(c =>
              c.id === selectedId ? { ...c, rotation: nextRotation(c.rotation) } : c
            ),
          });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, editingId, editingLabelId, pendingType, schematic, onChange, onPendingTypeChange]);

  // ── mouse events ──────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getSvgPoint(e);
    setMouseGrid(pt);
    if (pt && dragState && !dragState.dragging && !gridEq(pt, dragState.startMouseGrid))
      setDragState(ds => ds ? { ...ds, dragging: true } : null);
  }, [getSvgPoint, dragState]);

  const handleMouseLeave = useCallback(() => {
    setMouseGrid(null);
    setHoveredPinKey(null);
  }, []);

  const handleBgClick = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    if (dragState) return;
    const pt = getSvgPoint(e);
    if (!pt) return;

    // ── place port A / B marker ──
    if (pendingType === 'PA' || pendingType === 'PB') {
      const field = pendingType === 'PA' ? 'portA' : 'portB';
      onChange({ ...schematic, [field]: pt });
      if (!e.shiftKey) onPendingTypeChange(null);
      return;
    }

    // ── place a component ──
    if (pendingType && pendingType !== 'L') {
      const type = pendingType as ComponentType;
      const newComp: PlacedComponent = {
        id: uid(), type, value: defaultValue(type),
        pin1: pt, rotation: pendingRot,
      };
      // Bounds check all pins
      const pinPts = allPinsOf(newComp);
      const xs = pinPts.map(p => p.x), ys = pinPts.map(p => p.y);
      if (Math.min(...xs) < 0 || Math.min(...ys) < 0 ||
          Math.max(...xs) > CANVAS_COLS || Math.max(...ys) > CANVAS_ROWS) return;
      onChange({ ...schematic, components: [...schematic.components, newComp] });
      if (!e.shiftKey) onPendingTypeChange(null);
      return;
    }

    // ── place a wire label ──
    if (pendingType === 'L') {
      const existingLabel = schematic.labels.find(l => gridEq(l.point, pt));
      if (!existingLabel) {
        const nextN = schematic.labels.length + 1;
        const newLabel: WireLabel = { id: uid(), text: `NET${nextN}`, point: pt };
        onChange({ ...schematic, labels: [...schematic.labels, newLabel] });
        setEditingLabelId(newLabel.id);
      }
      if (!e.shiftKey) onPendingTypeChange(null);
      return;
    }

    // ── land a wire ──
    if (wiringFrom) {
      if (!gridEq(wiringFrom, pt)) {
        onChange({ ...schematic, wires: [...schematic.wires, { id: uid(), from: wiringFrom, to: pt }] });
        setWiringFrom(pt);
      }
      return;
    }

    setSelectedId(null);
    setEditingId(null);
  }, [dragState, pendingType, wiringFrom, pendingRot, schematic, onChange, onPendingTypeChange, getSvgPoint]);

  const handleBgRightClick = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    e.preventDefault();
    const pt = getSvgPoint(e);
    if (!pt) return;
    onChange({ ...schematic, groundPoint: gridEq(schematic.groundPoint, pt) ? null : pt });
  }, [schematic, onChange, getSvgPoint]);

  const handlePinClick = useCallback((pt: GridPoint, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragState) return;

    // ── place port marker on a wire junction ──
    if (pendingType === 'PA' || pendingType === 'PB') {
      const field = pendingType === 'PA' ? 'portA' : 'portB';
      onChange({ ...schematic, [field]: pt });
      if (!e.shiftKey) onPendingTypeChange(null);
      return;
    }

    if (wiringFrom) {
      if (!gridEq(wiringFrom, pt))
        onChange({ ...schematic, wires: [...schematic.wires, { id: uid(), from: wiringFrom, to: pt }] });
      setWiringFrom(null);
    } else {
      setWiringFrom(pt);
    }
  }, [wiringFrom, dragState, pendingType, schematic, onChange, onPendingTypeChange]);

  const handlePinRightClick = useCallback((pt: GridPoint, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange({ ...schematic, groundPoint: gridEq(schematic.groundPoint, pt) ? null : pt });
  }, [schematic, onChange]);

  const handleComponentMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingType || wiringFrom) return;
    const pt = getSvgPoint(e);
    if (!pt) return;
    const c = schematic.components.find(x => x.id === id);
    if (!c) return;
    wasAlreadySel.current = selectedIdRef.current === id;
    setDragState({ id, startMouseGrid: pt, startPin1: c.pin1, dragging: false });
  }, [pendingType, wiringFrom, getSvgPoint, schematic]);

  const handleWireClick = useCallback((wireId: string, e: React.MouseEvent) => {
    if (wiringFrom || pendingType) return;
    e.stopPropagation();
    onChange({ ...schematic, wires: schematic.wires.filter(w => w.id !== wireId) });
  }, [wiringFrom, pendingType, schematic, onChange]);

  const handleLabelClick = useCallback((labelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingType || wiringFrom) return;
    setEditingLabelId(id => id === labelId ? null : labelId);
  }, [pendingType, wiringFrom]);

  const handleLabelRightClick = useCallback((labelId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange({ ...schematic, labels: schematic.labels.filter(l => l.id !== labelId) });
    setEditingLabelId(id => id === labelId ? null : id);
  }, [schematic, onChange]);

  const updateValue = (id: string, raw: string) => {
    const v = parseFloat(raw);
    if (!isNaN(v) && v !== 0)
      onChange({ ...schematic, components: schematic.components.map(c => c.id === id ? { ...c, value: v } : c) });
  };

  const updateLabelText = (id: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    onChange({ ...schematic, labels: schematic.labels.map(l => l.id === id ? { ...l, text: t } : l) });
  };

  // ── render ────────────────────────────────────────────────────────────────

  const { components, wires, labels, groundPoint } = schematic;
  const showNodes          = !!(nodeHighlights && nodeVoltages);
  const isActivelyDragging = dragState?.dragging ?? false;

  // All component pin keys (for excluding from wireNodeMap)
  const compPinKeys = new Set(
    components.flatMap(c => allPinsOf(c).map(p => gk(p)))
  );
  // Wire junction nodes: wire endpoints not coinciding with any component pin
  const wireNodeMap = new Map<string, GridPoint>();
  for (const w of wires) {
    for (const pt of [w.from, w.to]) {
      const k = gk(pt);
      if (!compPinKeys.has(k)) wireNodeMap.set(k, pt);
    }
  }
  const wireNodes = [...wireNodeMap.entries()];

  const visualWireEnd = (w: Wire): Wire => {
    if (!isActivelyDragging || !mouseGrid) return w;
    const ds = dragState!;
    const c  = components.find(x => x.id === ds.id);
    if (!c) return w;
    const oldPins = allPinsOf(c);
    const pp1     = getDragPreviewPin1(ds, mouseGrid);
    const newPins = allPinsOf({ ...c, pin1: pp1 });
    const mv = (pt: GridPoint): GridPoint => {
      for (let i = 0; i < oldPins.length; i++)
        if (gridEq(pt, oldPins[i])) return newPins[i];
      return pt;
    };
    return { ...w, from: mv(w.from), to: mv(w.to) };
  };

  // Unified pin-circle renderer used for both component pins and ctrl pins
  const renderPinCircle = (
    rPt: GridPoint,       // rendered (possibly drag-preview) position
    orig: GridPoint,      // stored position (for event handlers & lookup)
    compColor: string,
  ) => {
    const s           = toScreen(rPt);
    const key         = gk(orig);
    const isWiringAnchor = gridEq(wiringFrom, orig);
    const isGnd       = gridEq(groundPoint, orig);
    const nodeId      = showNodes ? (nodeHighlights!.get(gk(rPt)) ?? nodeHighlights!.get(key)) : undefined;
    const nodeColor   = nodeId !== undefined ? NODE_COLORS[nodeId % NODE_COLORS.length] : undefined;
    return (
      <circle key={`pin-${key}`} cx={s.x} cy={s.y} r={PIN_R}
        fill={isGnd ? '#16a34a' : isWiringAnchor ? WIRE_COLOR : nodeColor ?? 'white'}
        fillOpacity={nodeColor && !isGnd && !isWiringAnchor ? 0.3 : 1}
        stroke={isWiringAnchor ? WIRE_COLOR : nodeColor ?? compColor}
        strokeWidth={nodeColor ? 2 : 1.5}
        style={{ cursor: 'crosshair' }}
        onClick={e  => handlePinClick(orig, e)}
        onContextMenu={e => handlePinRightClick(orig, e)}
        onMouseEnter={() => setHoveredPinKey(key)}
        onMouseLeave={() => setHoveredPinKey(k => k === key ? null : k)}
      />
    );
  };

  // Unified node-ring + hover-badge renderer
  const renderNodeRing = (
    rPt:   GridPoint,
    orig:  GridPoint,
    extraKey?: string,
  ) => {
    const pinKey = extraKey ?? gk(orig);
    const nodeId = nodeHighlights!.get(gk(orig));
    if (nodeId === undefined) return null;
    const s     = toScreen(rPt);
    const color = NODE_COLORS[nodeId % NODE_COLORS.length];
    const isHovered = hoveredPinKey === pinKey;
    const v     = nodeVoltages![nodeId];
    const label = fmtShortV(v);
    const badgeW = Math.max(label.length * 5.6 + 28, 52);
    return (
      <g key={`ring-${pinKey}`}>
        <circle cx={s.x} cy={s.y} r={9}
          fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5}
          pointerEvents="none"
        />
        {isHovered && (
          <g pointerEvents="none">
            <rect x={s.x - badgeW / 2} y={s.y - 32} width={badgeW} height={16} rx={4}
              fill="white" fillOpacity={0.95} stroke={color} strokeWidth={1.2} />
            <text x={s.x} y={s.y - 21}
              textAnchor="middle" fontSize={9.5} fill={color} fontWeight="700"
              fontFamily="'Courier New', monospace"
            >N{nodeId} · {label}</text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="editor-canvas-wrap">

      {/* ── Inline value editor ─────────────────────────────────────────── */}
      {editingId && !isActivelyDragging && (() => {
        const c = components.find(x => x.id === editingId);
        if (!c) return null;
        const isDependent = c.type === 'G' || c.type === 'E' || c.type === 'F' || c.type === 'H';

        const updateComp = (patch: Partial<typeof c>) =>
          onChange({ ...schematic, components: schematic.components.map(x =>
            x.id === c.id ? { ...x, ...patch } : x
          )});

        const rotateSelected = () => updateComp({ rotation: nextRotation(c.rotation) });

        return (
          <div className="inline-editor">
            <span className="inline-editor-label">{inlineEditorLabel(c.type)}</span>
            {c.type !== 'OC' && c.type !== 'A' ? (
              <>
                <input
                  key={`val-${c.id}`}
                  type="number" step="any"
                  defaultValue={c.value}
                  onBlur={e   => updateValue(c.id, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { updateValue(c.id, (e.target as HTMLInputElement).value); setEditingId(null); }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                {inlineEditorUnit(c.type) && (
                  <span className="inline-editor-unit">{inlineEditorUnit(c.type)}</span>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                {c.type === 'A' ? 'Place in series — label it (e.g. i1)' : 'No value — probe only'}
              </span>
            )}

            {/* Control variable (G/E/F/H only) */}
            {isDependent && (
              <>
                <span className="inline-editor-sep">·</span>
                <span className="inline-editor-label">Control:</span>
                <input
                  key={`ctrl-${c.id}`}
                  type="text"
                  style={{ width: 72 }}
                  placeholder="e.g. Vx"
                  defaultValue={c.controlVar ?? ''}
                  onBlur={e => updateComp({ controlVar: e.target.value.trim() || undefined })}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { updateComp({ controlVar: (e.target as HTMLInputElement).value.trim() || undefined }); setEditingId(null); }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              </>
            )}

            {/* Variable label (any component) */}
            <>
              <span className="inline-editor-sep">·</span>
              <span className="inline-editor-label">Label:</span>
              <input
                key={`lbl-${c.id}`}
                type="text"
                style={{ width: 64 }}
                placeholder="e.g. Vx"
                defaultValue={c.varName ?? ''}
                onBlur={e => updateComp({ varName: e.target.value.trim() || undefined })}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { updateComp({ varName: (e.target as HTMLInputElement).value.trim() || undefined }); setEditingId(null); }
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            </>

            <button className="inline-editor-rotate" onClick={rotateSelected} title="Cycle rotation (or press R)">
              ↻ {c.rotation}°
            </button>
            <button className="inline-editor-delete"
              onClick={() => {
                onChange({
                  ...schematic,
                  components: schematic.components.filter(x => x.id !== c.id),
                  wires: schematic.wires.filter(
                    w => !pinAt(w.from)?.componentId.startsWith(c.id) &&
                         !pinAt(w.to)?.componentId.startsWith(c.id)
                  ),
                });
                setSelectedId(null);
                setEditingId(null);
              }}
            >✕ Delete</button>
          </div>
        );
      })()}

      {/* ── Inline label text editor ────────────────────────────────────── */}
      {editingLabelId && (() => {
        const lbl = labels.find(l => l.id === editingLabelId);
        if (!lbl) return null;
        return (
          <div className="inline-editor">
            <span className="inline-editor-label">Net name</span>
            <input
              type="text"
              defaultValue={lbl.text}
              placeholder="e.g. VDD"
              style={{ width: 90 }}
              onBlur={e   => { updateLabelText(lbl.id, e.target.value); setEditingLabelId(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter')  { updateLabelText(lbl.id, (e.target as HTMLInputElement).value); setEditingLabelId(null); }
                if (e.key === 'Escape') setEditingLabelId(null);
              }}
            />
            <button className="inline-editor-delete"
              onClick={() => {
                onChange({ ...schematic, labels: schematic.labels.filter(l => l.id !== lbl.id) });
                setEditingLabelId(null);
              }}
            >✕ Delete</button>
          </div>
        );
      })()}

      {/* ── Selection hint bar ──────────────────────────────────────────── */}
      {selectedId && !editingId && !editingLabelId && !isActivelyDragging && (
        <div className="selection-hint">
          <span>↻ <kbd>R</kbd> rotate &nbsp;·&nbsp; ✎ click again to edit value &nbsp;·&nbsp; ⌫ <kbd>Del</kbd> delete</span>
        </div>
      )}

      {/* ── Placement / idle hint (shown only when nothing is selected) ─── */}
      {!selectedId && !editingId && !editingLabelId && placementHint && (
        <div className="placement-hint-bar">
          <span className="toolbar-hint">{placementHint}</span>
        </div>
      )}

      <svg
        ref={svgRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="editor-svg"
        style={{
          cursor: isActivelyDragging ? 'grabbing'
                : pendingType        ? 'crosshair'
                : wiringFrom        ? 'cell'
                : undefined,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onContextMenu={e => e.preventDefault()}
      >
        <defs>
          <pattern id="dot-grid" x="0" y="0" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="1.5" fill="#d1daea" />
          </pattern>
          <filter id="sel-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#dot-grid)" pointerEvents="none" />
        <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="transparent"
          onClick={handleBgClick} onContextMenu={handleBgRightClick} />

        {/* ── Wires ──────────────────────────────────────────────────────── */}
        {wires.map(w => {
          const vw  = visualWireEnd(w);
          const s1  = toScreen(vw.from), s2 = toScreen(vw.to);

          if (animateMode && nodeHighlights && nodeVoltages) {
            const nodeId    = nodeHighlights.get(gk(w.from)) ?? nodeHighlights.get(gk(w.to));
            const v         = nodeId !== undefined ? nodeVoltages[nodeId] : (vMin + vMax) / 2;
            const wColor    = voltageToColor(v, vMin, vMax);
            const dir       = wireFlows.get(w.id) ?? 0;
            const animName  = dir > 0 ? 'march-fwd' : dir < 0 ? 'march-rev' : 'march-fwd';
            return (
              <g key={w.id}>
                {/* Base colored wire */}
                <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
                  stroke={wColor} strokeWidth={3.5} strokeLinecap="round"
                  style={{ cursor: 'pointer' }}
                  onClick={e => handleWireClick(w.id, e)}
                />
                {/* Animated flow dashes */}
                <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
                  stroke="white" strokeWidth={3.5} strokeLinecap="round"
                  strokeDasharray="10 8"
                  style={{ animation: `${animName} 0.7s linear infinite`, opacity: 0.55 }}
                  pointerEvents="none"
                />
              </g>
            );
          }

          return (
            <line key={w.id} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
              stroke="#475569" strokeWidth={2.5} strokeLinecap="round"
              style={{ cursor: 'pointer' }}
              onClick={e => handleWireClick(w.id, e)}
            />
          );
        })}

        {/* ── Wire preview ───────────────────────────────────────────────── */}
        {wiringFrom && mouseGrid && (
          <line
            x1={toScreen(wiringFrom).x} y1={toScreen(wiringFrom).y}
            x2={toScreen(mouseGrid).x}  y2={toScreen(mouseGrid).y}
            stroke={WIRE_COLOR} strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round"
            pointerEvents="none"
          />
        )}

        {/* ── Wire junction dots ─────────────────────────────────────────── */}
        {wireNodes.map(([key, pt]) => {
          const s = toScreen(pt);
          const isWiringAnchor = gridEq(wiringFrom, pt);
          const isGnd  = gridEq(groundPoint, pt);
          const nodeId = (showNodes || animateMode) ? nodeHighlights?.get(key) : undefined;
          const nodeColor = nodeId !== undefined ? NODE_COLORS[nodeId % NODE_COLORS.length] : undefined;
          // Voltage-based color in animate mode
          const animNodeColor = animateMode && nodeId !== undefined && nodeVoltages
            ? voltageToColor(nodeVoltages[nodeId], vMin, vMax)
            : undefined;
          const dotFill   = isGnd ? '#16a34a' : isWiringAnchor ? WIRE_COLOR
                          : animNodeColor ?? nodeColor ?? 'white';
          const dotStroke = isWiringAnchor ? WIRE_COLOR : animNodeColor ?? nodeColor ?? '#64748b';
          return (
            <circle key={`jn-${key}`} cx={s.x} cy={s.y} r={animateMode ? PIN_R + 1 : PIN_R}
              fill={dotFill}
              fillOpacity={nodeColor && !isGnd && !isWiringAnchor && !animateMode ? 0.3 : 1}
              stroke={dotStroke}
              strokeWidth={isWiringAnchor || nodeColor ? 2 : 1.5}
              style={{ cursor: 'crosshair' }}
              onClick={e  => handlePinClick(pt, e)}
              onContextMenu={e => handlePinRightClick(pt, e)}
              onMouseEnter={() => setHoveredPinKey(key)}
              onMouseLeave={() => setHoveredPinKey(k => k === key ? null : k)}
            />
          );
        })}

        {/* ── Ground symbol ──────────────────────────────────────────────── */}
        {groundPoint && (() => {
          const s = toScreen(groundPoint);
          return (
            <g transform={`translate(${s.x},${s.y})`} fill="none" stroke="#16a34a"
               strokeWidth={2} pointerEvents="none">
              <GroundSymbol />
            </g>
          );
        })()}

        {/* ── Wire labels ────────────────────────────────────────────────── */}
        {labels.map(lbl => {
          const s       = toScreen(lbl.point);
          const isEditing = editingLabelId === lbl.id;
          const nodeId  = showNodes ? nodeHighlights!.get(gk(lbl.point)) : undefined;
          const nodeColor = nodeId !== undefined ? NODE_COLORS[nodeId % NODE_COLORS.length] : undefined;
          return (
            <g key={lbl.id}
              style={{ cursor: 'pointer' }}
              onClick={e  => handleLabelClick(lbl.id, e)}
              onContextMenu={e => handleLabelRightClick(lbl.id, e)}
            >
              {/* Anchor dot */}
              <circle cx={s.x} cy={s.y} r={4}
                fill={nodeColor ?? SEL_COLOR} stroke="white" strokeWidth={1} />
              {/* Label box */}
              <rect x={s.x + 5} y={s.y - 9} width={lbl.text.length * 7 + 8} height={16} rx={3}
                fill={nodeColor ? nodeColor + '22' : '#FFF9E6'}
                stroke={nodeColor ?? SEL_COLOR} strokeWidth={isEditing ? 2 : 1}
              />
              <text x={s.x + 9} y={s.y + 3}
                fontSize={10} fill={nodeColor ?? SEL_COLOR} fontWeight="600"
                fontFamily="'Courier New', monospace" pointerEvents="none"
              >{lbl.text}</text>
            </g>
          );
        })}

        {/* ── Port markers (Thévenin / Norton terminals) ─────────────────── */}
        {([['portA', '#7c3aed', 'a'], ['portB', '#0369a1', 'b']] as const).map(([field, color, label]) => {
          const pt = schematic[field];
          if (!pt) return null;
          const s = toScreen(pt);
          const isActive = pendingType === (field === 'portA' ? 'PA' : 'PB');
          return (
            <g key={field}
              style={{ cursor: 'pointer' }}
              onContextMenu={e => {
                e.preventDefault(); e.stopPropagation();
                onChange({ ...schematic, [field]: null });
              }}
            >
              {/* Connecting dot */}
              <circle cx={s.x} cy={s.y} r={5} fill={color} stroke="white" strokeWidth={1.5} />
              {/* Terminal arrow */}
              <polygon
                points={`${s.x+6},${s.y-7} ${s.x+16},${s.y} ${s.x+6},${s.y+7}`}
                fill={color} opacity={0.9}
              />
              <rect x={s.x+16} y={s.y-9} width={14} height={18} rx={3}
                fill={color} />
              <text x={s.x+23} y={s.y+5}
                textAnchor="middle" fontSize={11} fill="white" fontWeight="700"
                fontFamily="'Courier New', monospace" pointerEvents="none"
              >{label}</text>
              {isActive && (
                <circle cx={s.x} cy={s.y} r={10}
                  fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 3" opacity={0.7} />
              )}
            </g>
          );
        })}

        {/* Port ghost preview */}
        {(pendingType === 'PA' || pendingType === 'PB') && mouseGrid && (() => {
          const s     = toScreen(mouseGrid);
          const color = pendingType === 'PA' ? '#7c3aed' : '#0369a1';
          const label = pendingType === 'PA' ? 'a' : 'b';
          return (
            <g opacity={0.5} pointerEvents="none">
              <circle cx={s.x} cy={s.y} r={5} fill={color} stroke="white" strokeWidth={1.5} />
              <polygon points={`${s.x+6},${s.y-7} ${s.x+16},${s.y} ${s.x+6},${s.y+7}`} fill={color} />
              <rect x={s.x+16} y={s.y-9} width={14} height={18} rx={3} fill={color} />
              <text x={s.x+23} y={s.y+5}
                textAnchor="middle" fontSize={11} fill="white" fontWeight="700"
                fontFamily="'Courier New', monospace"
              >{label}</text>
            </g>
          );
        })()}

        {/* ── Components ─────────────────────────────────────────────────── */}
        {components.map(c => {
          const isSelected  = c.id === selectedId;
          const isDragged   = dragState?.id === c.id && isActivelyDragging;
          const rPin1 = isDragged && mouseGrid ? getDragPreviewPin1(dragState!, mouseGrid) : c.pin1;
          const rComp = { ...c, pin1: rPin1 };
          const rPin2 = getPin2(rComp);
          const s1    = toScreen(rPin1);
          const color = isSelected ? SEL_COLOR : '#1e293b';
          const lo    = labelOffset(c.rotation, c.type);
          const canDrag = !pendingType && !wiringFrom;

          return (
            <g key={c.id} opacity={isDragged ? 0.65 : 1}>
              <g
                transform={`translate(${s1.x},${s1.y}) rotate(${c.rotation})`}
                style={{ color, cursor: canDrag ? (isDragged ? 'grabbing' : 'grab') : 'pointer' }}
                onMouseDown={e => handleComponentMouseDown(c.id, e)}
                filter={isSelected && !isDragged ? 'url(#sel-glow)' : undefined}
              >
                <ComponentShape type={c.type} controlVar={c.controlVar} />
                {/* Hit area */}
                <rect x={0} y={-14} width={COMP_PX} height={28} fill="transparent" />
                {isSelected && !isDragged && (
                  <rect x={-4} y={-16} width={COMP_PX + 8} height={32}
                    fill="none" stroke={SEL_COLOR} strokeWidth={1.5}
                    strokeDasharray="5 3" rx={4} />
                )}
                {/* Current direction arrow (animate mode) */}
                {animateMode && c.type !== 'OC' && (() => {
                  const I = componentCurrents.get(c.id) ?? 0;
                  if (Math.abs(I) < 1e-12) return null;
                  const fwd = I > 0;
                  // Arrow centred on component body; points in ±x of local frame
                  const ax = COMP_PX / 2;
                  const pts = fwd
                    ? `${ax+7},0 ${ax-3},-5 ${ax-3},5`
                    : `${ax-7},0 ${ax+3},-5 ${ax+3},5`;
                  return (
                    <polygon points={pts}
                      fill="#ff6b1a" stroke="white" strokeWidth={0.8}
                      opacity={0.9} pointerEvents="none"
                      style={{ animation: 'cur-pulse 1.1s ease-in-out infinite' }}
                    />
                  );
                })()}
              </g>

              {/* Value label (skip for OC; dependent sources show their value w/o controlVar here) */}
              {c.type !== 'OC' && (
                <text x={s1.x + lo.dx} y={s1.y + lo.dy}
                  textAnchor="middle" fontSize={11} fill={color}
                  fontWeight={isSelected ? '600' : '400'} pointerEvents="none"
                >
                  {formatValue(c.value, c.type)}
                </text>
              )}

              {/* varName badge — shown for any component that has one */}
              {c.varName?.trim() && (() => {
                const vn = c.varName.trim();
                const bw = vn.length * 7 + 10;
                const bx = s1.x + lo.dx;
                const by = s1.y + lo.dy + (c.type === 'OC' ? 0 : 14);
                return (
                  <g pointerEvents="none">
                    <rect x={bx - bw / 2} y={by - 9} width={bw} height={13} rx={3}
                      fill="#fffbe6" stroke="#e8c000" strokeWidth={1} />
                    <text x={bx} y={by + 2} textAnchor="middle" fontSize={9.5}
                      fill="#6b4f00" fontStyle="italic" fontWeight="600">
                      {vn}
                    </text>
                  </g>
                );
              })()}

              {/* Output port pin circles (pin1 & pin2) */}
              {renderPinCircle(rPin1, c.pin1, color)}
              {renderPinCircle(rPin2, getPin2(c), color)}

            </g>
          );
        })}

        {/* ── Node rings + hover badges — components ─────────────────────── */}
        {showNodes && components.flatMap(c => {
          const isDragged = dragState?.id === c.id && isActivelyDragging;
          const rPin1 = isDragged && mouseGrid ? getDragPreviewPin1(dragState!, mouseGrid) : c.pin1;
          const rComp = { ...c, pin1: rPin1 };
          const origPins = allPinsOf(c);
          const rendPins = allPinsOf(rComp);
          return origPins.map((orig, pi) => renderNodeRing(rendPins[pi], orig)).filter(Boolean);
        })}

        {/* ── Node rings + hover badges — wire junctions ─────────────────── */}
        {showNodes && wireNodes.flatMap(([key, pt]) => {
          const nodeId = nodeHighlights!.get(key);
          if (nodeId === undefined) return [];
          const s     = toScreen(pt);
          const color = NODE_COLORS[nodeId % NODE_COLORS.length];
          const isHovered = hoveredPinKey === key;
          const v     = nodeVoltages![nodeId];
          const label = fmtShortV(v);
          const badgeW = Math.max(label.length * 5.6 + 28, 52);
          return [
            <circle key={`jn-ring-${key}`} cx={s.x} cy={s.y} r={9}
              fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5}
              pointerEvents="none"
            />,
            isHovered && (
              <g key={`jn-badge-${key}`} pointerEvents="none">
                <rect x={s.x - badgeW / 2} y={s.y - 32} width={badgeW} height={16} rx={4}
                  fill="white" fillOpacity={0.95} stroke={color} strokeWidth={1.2} />
                <text x={s.x} y={s.y - 21}
                  textAnchor="middle" fontSize={9.5} fill={color} fontWeight="700"
                  fontFamily="'Courier New', monospace"
                >N{nodeId} · {label}</text>
              </g>
            ),
          ].filter(Boolean) as React.JSX.Element[];
        })}

        {/* ── Placement ghost ────────────────────────────────────────────── */}
        {pendingType && pendingType !== 'L' && mouseGrid && (() => {
          const type  = pendingType as ComponentType;
          const s     = toScreen(mouseGrid);
          const gh: PlacedComponent = {
            id: '__ghost__', type, value: defaultValue(type),
            pin1: mouseGrid, rotation: pendingRot,
          };
          const s2    = toScreen(getPin2(gh));
          return (
            <g opacity={0.45} pointerEvents="none">
              <g transform={`translate(${s.x},${s.y}) rotate(${pendingRot})`} style={{ color: SEL_COLOR }}>
                <ComponentShape type={type} />
              </g>
              <circle cx={s.x}  cy={s.y}  r={PIN_R} fill="white" stroke={SEL_COLOR} strokeWidth={1.5} />
              <circle cx={s2.x} cy={s2.y} r={PIN_R} fill="white" stroke={SEL_COLOR} strokeWidth={1.5} />
            </g>
          );
        })()}

        {/* ── Label placement ghost ──────────────────────────────────────── */}
        {pendingType === 'L' && mouseGrid && (() => {
          const s = toScreen(mouseGrid);
          const previewText = 'NET?';
          return (
            <g opacity={0.5} pointerEvents="none">
              <circle cx={s.x} cy={s.y} r={4} fill={SEL_COLOR} stroke="white" strokeWidth={1} />
              <rect x={s.x + 5} y={s.y - 9} width={previewText.length * 7 + 8} height={16} rx={3}
                fill="#FFF9E6" stroke={SEL_COLOR} strokeWidth={1} />
              <text x={s.x + 9} y={s.y + 3} fontSize={10} fill={SEL_COLOR} fontWeight="600"
                fontFamily="'Courier New', monospace">{previewText}</text>
            </g>
          );
        })()}
      </svg>

    </div>
  );
}
