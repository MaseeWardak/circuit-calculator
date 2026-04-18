import { useCallback, useEffect, useRef, useState } from 'react';
import type { BranchType, GridPoint, PlacedComponent, Schematic, Wire } from './types';
import { ComponentShape, GroundSymbol } from './ComponentShape';
import {
  CANVAS_COLS, CANVAS_H, CANVAS_ROWS, CANVAS_W,
  COMP_PX, GRID, NODE_COLORS, PIN_R,
} from './constants';
import { formatValue, getPin2, gk, gridEq, snapToGrid, toScreen } from './utils';

function uid(): string { return crypto.randomUUID(); }

type Rotation = 0 | 90 | 180 | 270;
function nextRotation(r: Rotation): Rotation {
  return (r === 0 ? 90 : r === 90 ? 180 : r === 180 ? 270 : 0) as Rotation;
}

function labelOffset(rotation: Rotation): { dx: number; dy: number } {
  switch (rotation) {
    case   0: return { dx:  COMP_PX / 2, dy: -20 };
    case  90: return { dx:  22,          dy:  COMP_PX / 2 };
    case 180: return { dx: -COMP_PX / 2, dy: -20 };
    case 270: return { dx:  22,          dy: -COMP_PX / 2 };
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

/** Gold tones used for selection / interaction on the canvas. */
const SEL_COLOR  = '#B8860B'; // dark goldenrod — visible on light canvas
const WIRE_COLOR = '#B8860B'; // wiring-mode indicator

interface DragState {
  id:             string;
  startMouseGrid: GridPoint;
  startPin1:      GridPoint;
  dragging:       boolean;
}

interface Props {
  schematic: Schematic;
  onChange: (s: Schematic) => void;
  pendingType: BranchType | null;
  onPendingTypeChange: (t: BranchType | null) => void;
  nodeHighlights?: Map<string, number> | null;
  nodeVoltages?: number[] | null;
}

export default function EditorCanvas({
  schematic, onChange, pendingType, onPendingTypeChange,
  nodeHighlights, nodeVoltages,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [mouseGrid, setMouseGrid]         = useState<GridPoint | null>(null);
  const [wiringFrom, setWiringFrom]       = useState<GridPoint | null>(null);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  // editingId is set only when the user explicitly wants to edit the value
  // (second click on an already-selected component, or pressing Enter).
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [pendingRot, setPendingRot]       = useState<Rotation>(0);
  const [dragState, setDragState]         = useState<DragState | null>(null);
  const [hoveredPinKey, setHoveredPinKey] = useState<string | null>(null);

  // Refs so global handlers read current values without stale closures
  const mouseGridRef      = useRef<GridPoint | null>(null);
  const dragStateRef      = useRef<DragState | null>(null);
  const schematicRef      = useRef<Schematic>(schematic);
  const selectedIdRef     = useRef<string | null>(null);
  const wasAlreadySel     = useRef(false); // was the component already selected when mousedown fired?
  mouseGridRef.current    = mouseGrid;
  dragStateRef.current    = dragState;
  schematicRef.current    = schematic;
  selectedIdRef.current   = selectedId;

  // ── helpers ───────────────────────────────────────────────────────────────

  const getSvgPoint = useCallback((e: React.MouseEvent | MouseEvent): GridPoint | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return snapToGrid(e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  const allPins = (sc = schematic) =>
    sc.components.flatMap(c => [
      { pt: c.pin1,     componentId: c.id },
      { pt: getPin2(c), componentId: c.id },
    ]);

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
    const newPin2 = getPin2({ ...c, pin1: newPin1 });
    const minX = Math.min(newPin1.x, newPin2.x), maxX = Math.max(newPin1.x, newPin2.x);
    const minY = Math.min(newPin1.y, newPin2.y), maxY = Math.max(newPin1.y, newPin2.y);
    if (minX < 0 || minY < 0 || maxX > CANVAS_COLS || maxY > CANVAS_ROWS) return;

    const oldPin1 = c.pin1, oldPin2 = getPin2(c);
    const moveEnd = (pt: GridPoint): GridPoint =>
      gridEq(pt, oldPin1) ? newPin1 : gridEq(pt, oldPin2) ? newPin2 : pt;

    onChange({
      ...sc,
      components: sc.components.map(x => x.id === ds.id ? { ...x, pin1: newPin1 } : x),
      wires:      sc.wires.map(w => ({ ...w, from: moveEnd(w.from), to: moveEnd(w.to) })),
    });
    setSelectedId(ds.id);
    setEditingId(null);
  }, [onChange]);

  // ── global mouseup — safety net for out-of-SVG release ───────────────────

  useEffect(() => {
    if (!dragState) return;
    const onGlobalUp = () => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const mg = mouseGridRef.current;
      if (ds.dragging && mg) {
        commitDrag(ds, mg);
      } else if (!ds.dragging) {
        // It was a plain click, not a drag.
        if (wasAlreadySel.current) {
          // Second click on an already-selected component → open value editor.
          setSelectedId(ds.id);
          setEditingId(ds.id);
        } else {
          // First click → just select, no editor.
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
      // Never steal keystrokes from inputs or contenteditable elements.
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      if (e.key === 'Escape') {
        if (editingId) { setEditingId(null); return; }
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
        if (pendingType) { setPendingRot(r => nextRotation(r)); return; }
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
  }, [selectedId, editingId, pendingType, schematic, onChange, onPendingTypeChange]);

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

    if (pendingType) {
      const newComp: PlacedComponent = {
        id: uid(), type: pendingType, value: defaultValue(pendingType),
        pin1: pt, rotation: pendingRot,
      };
      const p2 = getPin2(newComp);
      const minX = Math.min(pt.x, p2.x), maxX = Math.max(pt.x, p2.x);
      const minY = Math.min(pt.y, p2.y), maxY = Math.max(pt.y, p2.y);
      if (minX < 0 || minY < 0 || maxX > CANVAS_COLS || maxY > CANVAS_ROWS) return;
      onChange({ ...schematic, components: [...schematic.components, newComp] });
      if (!e.shiftKey) onPendingTypeChange(null);
      return;
    }

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
    if (wiringFrom) {
      if (!gridEq(wiringFrom, pt))
        onChange({ ...schematic, wires: [...schematic.wires, { id: uid(), from: wiringFrom, to: pt }] });
      setWiringFrom(null);
    } else {
      setWiringFrom(pt);
    }
  }, [wiringFrom, dragState, schematic, onChange]);

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
    // Record whether this component was already selected — used on mouseup to decide
    // whether to open the value editor (second click) or just select (first click).
    wasAlreadySel.current = selectedIdRef.current === id;
    setDragState({ id, startMouseGrid: pt, startPin1: c.pin1, dragging: false });
  }, [pendingType, wiringFrom, getSvgPoint, schematic]);

  const handleWireClick = useCallback((wireId: string, e: React.MouseEvent) => {
    // While the user is drawing a wire or placing a component, clicks on wire
    // bodies must NOT be consumed here — let them fall through to the background
    // so the user can land the wire at any snapped grid point near the wire.
    if (wiringFrom || pendingType) return;
    e.stopPropagation();
    onChange({ ...schematic, wires: schematic.wires.filter(w => w.id !== wireId) });
  }, [wiringFrom, pendingType, schematic, onChange]);

  const updateValue = (id: string, raw: string) => {
    const v = parseFloat(raw);
    if (!isNaN(v) && v !== 0)
      onChange({ ...schematic, components: schematic.components.map(c => c.id === id ? { ...c, value: v } : c) });
  };

  // ── render ────────────────────────────────────────────────────────────────

  const { components, wires, groundPoint } = schematic;
  const showNodes          = !!(nodeHighlights && nodeVoltages);
  const isActivelyDragging = dragState?.dragging ?? false;

  // Wire junction nodes: wire endpoints that are NOT at a component pin.
  // These get interactive circles so the user can start/end wires from them.
  const compPinKeys = new Set(components.flatMap(c => [gk(c.pin1), gk(getPin2(c))]));
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
    const pp1 = getDragPreviewPin1(ds, mouseGrid);
    const pp2 = getPin2({ ...c, pin1: pp1 });
    const o1 = c.pin1, o2 = getPin2(c);
    const mv = (pt: GridPoint) => gridEq(pt, o1) ? pp1 : gridEq(pt, o2) ? pp2 : pt;
    return { ...w, from: mv(w.from), to: mv(w.to) };
  };

  return (
    <div className="editor-canvas-wrap">
      <svg
        ref={svgRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="editor-svg"
        style={{ cursor: isActivelyDragging ? 'grabbing' : pendingType ? 'crosshair' : wiringFrom ? 'cell' : undefined }}
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
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#dot-grid)" pointerEvents="none" />
        <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="transparent" onClick={handleBgClick} onContextMenu={handleBgRightClick} />

        {/* ---- Wires ---- */}
        {wires.map(w => {
          const vw = visualWireEnd(w);
          const s1 = toScreen(vw.from), s2 = toScreen(vw.to);
          return (
            <line key={w.id} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
              stroke="#475569" strokeWidth={2.5} strokeLinecap="round"
              style={{ cursor: 'pointer' }}
              onClick={e => handleWireClick(w.id, e)}
            />
          );
        })}

        {/* ---- Wire preview ---- */}
        {wiringFrom && mouseGrid && (
          <line
            x1={toScreen(wiringFrom).x} y1={toScreen(wiringFrom).y}
            x2={toScreen(mouseGrid).x}  y2={toScreen(mouseGrid).y}
            stroke={WIRE_COLOR} strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round"
            pointerEvents="none"
          />
        )}

        {/* ---- Wire junction dots (wire endpoints without a component pin) ---- */}
        {wireNodes.map(([key, pt]) => {
          const s = toScreen(pt);
          const isWiringAnchor = gridEq(wiringFrom, pt);
          const isGnd = gridEq(groundPoint, pt);
          const nodeId = showNodes ? nodeHighlights!.get(key) : undefined;
          const nodeColor = nodeId !== undefined ? NODE_COLORS[nodeId % NODE_COLORS.length] : undefined;
          return (
            <circle
              key={`jn-${key}`}
              cx={s.x} cy={s.y} r={PIN_R}
              fill={isGnd ? '#16a34a' : isWiringAnchor ? WIRE_COLOR : nodeColor ?? 'white'}
              fillOpacity={nodeColor && !isGnd && !isWiringAnchor ? 0.3 : 1}
              stroke={isWiringAnchor ? WIRE_COLOR : nodeColor ?? '#64748b'}
              strokeWidth={isWiringAnchor || nodeColor ? 2 : 1.5}
              style={{ cursor: 'crosshair' }}
              onClick={e => handlePinClick(pt, e)}
              onContextMenu={e => handlePinRightClick(pt, e)}
              onMouseEnter={() => setHoveredPinKey(key)}
              onMouseLeave={() => setHoveredPinKey(k => k === key ? null : k)}
            />
          );
        })}

        {/* ---- Ground symbol ---- */}
        {groundPoint && (() => {
          const s = toScreen(groundPoint);
          return (
            <g transform={`translate(${s.x},${s.y})`} fill="none" stroke="#16a34a" strokeWidth={2} pointerEvents="none">
              <GroundSymbol />
            </g>
          );
        })()}

        {/* ---- Components ---- */}
        {components.map(c => {
          const isSelected  = c.id === selectedId;
          const isDragged   = dragState?.id === c.id && isActivelyDragging;
          const rPin1 = isDragged && mouseGrid ? getDragPreviewPin1(dragState!, mouseGrid) : c.pin1;
          const rPin2 = getPin2({ ...c, pin1: rPin1 });
          const s1 = toScreen(rPin1), s2 = toScreen(rPin2);
          const color = isSelected ? SEL_COLOR : '#1e293b';
          const lo = labelOffset(c.rotation);
          const canDrag = !pendingType && !wiringFrom;

          return (
            <g key={c.id} opacity={isDragged ? 0.65 : 1}>
              <g
                transform={`translate(${s1.x},${s1.y}) rotate(${c.rotation})`}
                style={{ color, cursor: canDrag ? (isDragged ? 'grabbing' : 'grab') : 'pointer' }}
                onMouseDown={e => handleComponentMouseDown(c.id, e)}
                filter={isSelected && !isDragged ? 'url(#sel-glow)' : undefined}
              >
                <ComponentShape type={c.type} />
                <rect x={0} y={-14} width={COMP_PX} height={28} fill="transparent" />
                {isSelected && !isDragged && (
                  <rect x={-4} y={-16} width={COMP_PX + 8} height={32}
                    fill="none" stroke={SEL_COLOR} strokeWidth={1.5} strokeDasharray="5 3" rx={4} />
                )}
              </g>

              <text x={s1.x + lo.dx} y={s1.y + lo.dy}
                textAnchor="middle" fontSize={11} fill={color}
                fontWeight={isSelected ? '600' : '400'} pointerEvents="none"
              >
                {formatValue(c.value, c.type)}
              </text>

              {/* Pin circles */}
              {([{ rPt: rPin1, orig: c.pin1 }, { rPt: rPin2, orig: getPin2(c) }] as const).map(
                ({ rPt, orig }, pi) => {
                  const s = toScreen(rPt);
                  const isWiringAnchor = gridEq(wiringFrom, orig);
                  const isGnd = gridEq(groundPoint, orig);
                  // Look up node by *current* pin position in case pinToNode is stale
                  const nodeId = showNodes ? nodeHighlights!.get(gk(rPt)) ?? nodeHighlights!.get(gk(orig)) : undefined;
                  const nodeColor = nodeId !== undefined ? NODE_COLORS[nodeId % NODE_COLORS.length] : undefined;
                  const pinKey = gk(orig);
                  return (
                    <circle key={pi} cx={s.x} cy={s.y} r={PIN_R}
                      fill={isGnd ? '#16a34a' : isWiringAnchor ? WIRE_COLOR : nodeColor ?? 'white'}
                      fillOpacity={nodeColor && !isGnd && !isWiringAnchor ? 0.3 : 1}
                      stroke={isWiringAnchor ? WIRE_COLOR : nodeColor ?? color}
                      strokeWidth={nodeColor ? 2 : 1.5}
                      style={{ cursor: 'crosshair' }}
                      onClick={e => handlePinClick(orig, e)}
                      onContextMenu={e => handlePinRightClick(orig, e)}
                      onMouseEnter={() => setHoveredPinKey(pinKey)}
                      onMouseLeave={() => setHoveredPinKey(k => k === pinKey ? null : k)}
                    />
                  );
                }
              )}
            </g>
          );
        })}

        {/* ---- Node rings + hover badges ---- */}
        {showNodes && components.flatMap(c => {
          const isDragged = dragState?.id === c.id && isActivelyDragging;
          return ([c.pin1, getPin2(c)] as const).flatMap(origPin => {
            // Use the rendered position (drag-preview or actual) for the ring location
            const rPin1 = isDragged && mouseGrid ? getDragPreviewPin1(dragState!, mouseGrid) : c.pin1;
            const rPin = gridEq(origPin, c.pin1)
              ? rPin1
              : getPin2({ ...c, pin1: rPin1 });
            // Only show ring if the *original* pin key is still in the highlights map
            const nodeId = nodeHighlights!.get(gk(origPin));
            if (nodeId === undefined) return [];

            const s = toScreen(rPin);
            const color = NODE_COLORS[nodeId % NODE_COLORS.length];
            const pinKey = gk(origPin);
            const isHovered = hoveredPinKey === pinKey;
            const v = nodeVoltages![nodeId];
            const label = fmtShortV(v);
            const badgeW = Math.max(label.length * 5.6 + 28, 52);

            return [
              <circle key={`ring-${pinKey}`}
                cx={s.x} cy={s.y} r={9}
                fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5}
                pointerEvents="none"
              />,
              isHovered && (
                <g key={`badge-${pinKey}`} pointerEvents="none">
                  <rect x={s.x - badgeW / 2} y={s.y - 32} width={badgeW} height={16} rx={4}
                    fill="white" fillOpacity={0.95} stroke={color} strokeWidth={1.2} />
                  <text x={s.x} y={s.y - 21}
                    textAnchor="middle" fontSize={9.5} fill={color} fontWeight="700"
                    fontFamily="'Courier New', monospace"
                  >N{nodeId} · {label}</text>
                </g>
              ),
            ].filter(Boolean) as JSX.Element[];
          });
        })}

        {/* ---- Node rings + hover badges for wire junction nodes ---- */}
        {showNodes && wireNodes.flatMap(([key, pt]) => {
          const nodeId = nodeHighlights!.get(key);
          if (nodeId === undefined) return [];
          const s = toScreen(pt);
          const color = NODE_COLORS[nodeId % NODE_COLORS.length];
          const isHovered = hoveredPinKey === key;
          const v = nodeVoltages![nodeId];
          const label = fmtShortV(v);
          const badgeW = Math.max(label.length * 5.6 + 28, 52);
          return [
            <circle key={`jn-ring-${key}`}
              cx={s.x} cy={s.y} r={9}
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
          ].filter(Boolean) as JSX.Element[];
        })}

        {/* ---- Placement ghost ---- */}
        {pendingType && mouseGrid && (() => {
          const s  = toScreen(mouseGrid);
          const gh: PlacedComponent = { id: '__ghost__', type: pendingType, value: defaultValue(pendingType), pin1: mouseGrid, rotation: pendingRot };
          const s2 = toScreen(getPin2(gh));
          return (
            <g opacity={0.45} pointerEvents="none">
              <g transform={`translate(${s.x},${s.y}) rotate(${pendingRot})`} style={{ color: SEL_COLOR }}>
                <ComponentShape type={pendingType} />
              </g>
              <circle cx={s.x}  cy={s.y}  r={PIN_R} fill="white" stroke={SEL_COLOR} strokeWidth={1.5} />
              <circle cx={s2.x} cy={s2.y} r={PIN_R} fill="white" stroke={SEL_COLOR} strokeWidth={1.5} />
            </g>
          );
        })()}
      </svg>

      {/* ---- Inline value editor (only when editingId is set) ---- */}
      {editingId && !isActivelyDragging && (() => {
        const c = components.find(x => x.id === editingId);
        if (!c) return null;
        const rotateSelected = () =>
          onChange({ ...schematic, components: schematic.components.map(x =>
            x.id === editingId ? { ...x, rotation: nextRotation(x.rotation) } : x
          )});
        return (
          <div className="inline-editor">
            <span className="inline-editor-label">
              {c.type === 'R' ? 'Resistance' : c.type === 'V' ? 'Voltage' : 'Current'}
            </span>
            <input
              type="number" step="any"
              defaultValue={c.value}
              onBlur={e   => updateValue(c.id, e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { updateValue(c.id, (e.target as HTMLInputElement).value); setEditingId(null); }
                if (e.key === 'Escape') setEditingId(null);
              }}
            />
            <span className="inline-editor-unit">
              {c.type === 'R' ? 'Ω' : c.type === 'V' ? 'V' : 'A'}
            </span>
            <button className="inline-editor-rotate" onClick={rotateSelected} title="Cycle rotation (or press R)">
              ↻ {c.rotation}°
            </button>
            <button className="inline-editor-delete"
              onClick={() => {
                onChange({
                  ...schematic,
                  components: schematic.components.filter(x => x.id !== editingId),
                  wires: schematic.wires.filter(w =>
                    !allPins().filter(p => p.componentId === editingId).some(
                      p => gridEq(p.pt, w.from) || gridEq(p.pt, w.to)
                    )
                  ),
                });
                setSelectedId(null);
                setEditingId(null);
              }}
            >Delete</button>
          </div>
        );
      })()}

      {/* ---- Selection hint (shown when selected but not editing) ---- */}
      {selectedId && !editingId && !isActivelyDragging && (
        <div className="selection-hint">
          <span>↻ <kbd>R</kbd> rotate &nbsp;·&nbsp; ✎ click again to edit value &nbsp;·&nbsp; ⌫ <kbd>Del</kbd> delete</span>
        </div>
      )}
    </div>
  );
}

function defaultValue(t: BranchType): number {
  if (t === 'R') return 1000;
  if (t === 'V') return 10;
  return 0.001;
}
