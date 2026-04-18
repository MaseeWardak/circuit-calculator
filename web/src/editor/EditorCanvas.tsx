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
  if (abs === 0)    return '0 V';
  if (abs >= 1e3)   return (v / 1e3).toPrecision(3) + ' kV';
  if (abs >= 1)     return v.toPrecision(3) + ' V';
  if (abs >= 1e-3)  return (v * 1e3).toPrecision(3) + ' mV';
  return                   (v * 1e6).toPrecision(3) + ' µV';
}

// ── Drag state ─────────────────────────────────────────────────────────────
interface DragState {
  id:              string;
  startMouseGrid:  GridPoint;
  startPin1:       GridPoint;
  dragging:        boolean;  // false until mouse moves at least 1 grid unit
}

// ── Props ──────────────────────────────────────────────────────────────────
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

  const [mouseGrid, setMouseGrid]       = useState<GridPoint | null>(null);
  const [wiringFrom, setWiringFrom]     = useState<GridPoint | null>(null);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [pendingRot, setPendingRot]     = useState<Rotation>(0);
  const [dragState, setDragState]       = useState<DragState | null>(null);
  const [hoveredPinKey, setHoveredPinKey] = useState<string | null>(null);

  // Keep refs so global event handlers can read current values without stale closures
  const mouseGridRef  = useRef<GridPoint | null>(null);
  const dragStateRef  = useRef<DragState | null>(null);
  const schematicRef  = useRef<Schematic>(schematic);
  mouseGridRef.current = mouseGrid;
  dragStateRef.current = dragState;
  schematicRef.current = schematic;

  // ── helpers ───────────────────────────────────────────────────────────────

  const getSvgPoint = useCallback((e: React.MouseEvent | MouseEvent): GridPoint | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return snapToGrid(e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  const allPins = (sc = schematic): Array<{ pt: GridPoint; componentId: string }> =>
    sc.components.flatMap(c => [
      { pt: c.pin1,      componentId: c.id },
      { pt: getPin2(c),  componentId: c.id },
    ]);

  const pinAt = (pt: GridPoint, sc = schematic) =>
    allPins(sc).find(p => gridEq(p.pt, pt)) ?? null;

  /** Compute where pin1 would be if we drag the component to where the mouse is now. */
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

    const oldPin1 = c.pin1;
    const oldPin2 = getPin2(c);

    const moveWireEnd = (pt: GridPoint): GridPoint =>
      gridEq(pt, oldPin1) ? newPin1 : gridEq(pt, oldPin2) ? newPin2 : pt;

    onChange({
      ...sc,
      components: sc.components.map(x => x.id === ds.id ? { ...x, pin1: newPin1 } : x),
      wires: sc.wires.map(w => ({ ...w, from: moveWireEnd(w.from), to: moveWireEnd(w.to) })),
    });
    setSelectedId(ds.id);
  }, [onChange]);

  // ── global mouse-up (safety net for out-of-SVG release) ──────────────────

  useEffect(() => {
    if (!dragState) return;
    const onGlobalUp = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const mg = mouseGridRef.current;
      if (ds.dragging && mg) commitDrag(ds, mg);
      else if (!ds.dragging) setSelectedId(prev => prev === ds.id ? null : ds.id);
      setDragState(null);
    };
    window.addEventListener('mouseup', onGlobalUp);
    return () => window.removeEventListener('mouseup', onGlobalUp);
  }, [!!dragState, commitDrag]);

  // ── keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  }, [selectedId, pendingType, schematic, onChange, onPendingTypeChange]);

  // ── mouse events ──────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getSvgPoint(e);
    setMouseGrid(pt);
    // Transition to dragging once mouse moves at least 1 grid unit from start
    if (pt && dragState && !dragState.dragging && !gridEq(pt, dragState.startMouseGrid)) {
      setDragState(ds => ds ? { ...ds, dragging: true } : null);
    }
  }, [getSvgPoint, dragState]);

  const handleMouseLeave = useCallback(() => {
    setMouseGrid(null);
    setHoveredPinKey(null);
  }, []);

  // SVG-level mouseup is handled by the global listener above.
  // We prevent the background click from firing during/after a drag via dragState checks.

  const handleBgClick = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    if (dragState) return; // ignore clicks that were actually drag releases
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
  }, [dragState, pendingType, wiringFrom, pendingRot, schematic, onChange, onPendingTypeChange, getSvgPoint]);

  const handleBgRightClick = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    e.preventDefault();
    const pt = getSvgPoint(e);
    if (!pt) return;
    onChange({ ...schematic, groundPoint: gridEq(schematic.groundPoint, pt) ? null : pt });
  }, [schematic, onChange, getSvgPoint]);

  const handlePinClick = useCallback((pt: GridPoint, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragState) return; // ignore if a drag just ended
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

  /** Start a potential drag on the component body. Selection is resolved on mouseup. */
  const handleComponentMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingType || wiringFrom) return;
    const pt = getSvgPoint(e);
    if (!pt) return;
    const c = schematic.components.find(x => x.id === id);
    if (!c) return;
    setDragState({ id, startMouseGrid: pt, startPin1: c.pin1, dragging: false });
  }, [pendingType, wiringFrom, getSvgPoint, schematic]);

  const handleWireClick = useCallback((wireId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ ...schematic, wires: schematic.wires.filter(w => w.id !== wireId) });
  }, [schematic, onChange]);

  // ── value editing ─────────────────────────────────────────────────────────

  const updateValue = (id: string, raw: string) => {
    const v = parseFloat(raw);
    if (!isNaN(v) && v !== 0)
      onChange({ ...schematic, components: schematic.components.map(c => c.id === id ? { ...c, value: v } : c) });
  };

  // ── render ────────────────────────────────────────────────────────────────

  const { components, wires, groundPoint } = schematic;
  const showNodes = !!(nodeHighlights && nodeVoltages);
  const isActivelyDragging = dragState?.dragging ?? false;

  /** Visual wire endpoints adjusted for the component currently being dragged. */
  const visualWireEnd = (w: Wire): Wire => {
    if (!isActivelyDragging || !mouseGrid) return w;
    const ds = dragState!;
    const c  = components.find(x => x.id === ds.id);
    if (!c) return w;
    const previewPin1 = getDragPreviewPin1(ds, mouseGrid);
    const previewPin2 = getPin2({ ...c, pin1: previewPin1 });
    const oldPin1 = c.pin1, oldPin2 = getPin2(c);
    const moveEnd = (pt: GridPoint): GridPoint =>
      gridEq(pt, oldPin1) ? previewPin1 : gridEq(pt, oldPin2) ? previewPin2 : pt;
    return { ...w, from: moveEnd(w.from), to: moveEnd(w.to) };
  };

  const svgCursor = isActivelyDragging ? 'grabbing' : pendingType ? 'crosshair' : wiringFrom ? 'cell' : '';

  return (
    <div className="editor-canvas-wrap">
      <svg
        ref={svgRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className={`editor-svg${svgCursor ? ` cursor-${svgCursor}` : ''}`}
        style={isActivelyDragging ? { cursor: 'grabbing' } : undefined}
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

        {/* ---- Grid ---- */}
        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#dot-grid)" pointerEvents="none" />

        {/* ---- Background click target ---- */}
        <rect
          x={0} y={0} width={CANVAS_W} height={CANVAS_H}
          fill="transparent"
          onClick={handleBgClick}
          onContextMenu={handleBgRightClick}
        />

        {/* ---- Wires (visually follow the dragged component) ---- */}
        {wires.map(w => {
          const vw = visualWireEnd(w);
          const s1 = toScreen(vw.from), s2 = toScreen(vw.to);
          return (
            <line
              key={w.id}
              x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
              stroke="#475569" strokeWidth={2.5} strokeLinecap="round"
              style={{ cursor: 'pointer' }}
              onClick={e => handleWireClick(w.id, e)}
            />
          );
        })}

        {/* ---- Wire preview (while wiring) ---- */}
        {wiringFrom && mouseGrid && (
          <line
            x1={toScreen(wiringFrom).x} y1={toScreen(wiringFrom).y}
            x2={toScreen(mouseGrid).x}  y2={toScreen(mouseGrid).y}
            stroke="#2563eb" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round"
            pointerEvents="none"
          />
        )}

        {/* ---- Ground symbol ---- */}
        {groundPoint && (() => {
          const s = toScreen(groundPoint);
          return (
            <g transform={`translate(${s.x},${s.y})`} fill="none" stroke="#16a34a" strokeWidth={2} pointerEvents="none">
              <GroundSymbol />
            </g>
          );
        })()}

        {/* ---- Placed components ---- */}
        {components.map(c => {
          const isSelected  = c.id === selectedId;
          const isDragged   = dragState?.id === c.id && isActivelyDragging;
          const renderPin1  = isDragged && mouseGrid ? getDragPreviewPin1(dragState!, mouseGrid) : c.pin1;
          const renderPin2  = getPin2({ ...c, pin1: renderPin1 });
          const s1 = toScreen(renderPin1);
          const s2 = toScreen(renderPin2);
          const color = isSelected ? '#2563eb' : '#1e293b';
          const lo = labelOffset(c.rotation);
          const canDrag = !pendingType && !wiringFrom;

          return (
            <g key={c.id} opacity={isDragged ? 0.65 : 1}>
              {/* Body */}
              <g
                transform={`translate(${s1.x},${s1.y}) rotate(${c.rotation})`}
                style={{
                  color,
                  cursor: canDrag ? (isActivelyDragging && isDragged ? 'grabbing' : 'grab') : 'pointer',
                }}
                onMouseDown={e => handleComponentMouseDown(c.id, e)}
                filter={isSelected && !isDragged ? 'url(#sel-glow)' : undefined}
              >
                <ComponentShape type={c.type} />
                <rect x={0} y={-14} width={COMP_PX} height={28} fill="transparent" />
                {isSelected && !isDragged && (
                  <rect x={-4} y={-16} width={COMP_PX + 8} height={32}
                    fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="5 3" rx={4} />
                )}
              </g>

              {/* Value label */}
              <text
                x={s1.x + lo.dx} y={s1.y + lo.dy}
                textAnchor="middle" fontSize={11} fill={color}
                fontWeight={isSelected ? '600' : '400'}
                pointerEvents="none"
              >
                {formatValue(c.value, c.type)}
              </text>

              {/* Pin circles */}
              {([{ pt: renderPin1, orig: c.pin1 }, { pt: renderPin2, orig: getPin2(c) }] as const).map(
                ({ pt, orig }, pi) => {
                  const s = toScreen(pt);
                  const isWiringAnchor = gridEq(wiringFrom, orig);
                  const isGnd = gridEq(groundPoint, orig);
                  const nodeId = showNodes ? nodeHighlights!.get(gk(orig)) : undefined;
                  const nodeColor = nodeId !== undefined ? NODE_COLORS[nodeId % NODE_COLORS.length] : undefined;
                  const pinKey = gk(orig);
                  return (
                    <circle
                      key={pi}
                      cx={s.x} cy={s.y} r={PIN_R}
                      fill={
                        isGnd          ? '#16a34a' :
                        isWiringAnchor ? '#2563eb' :
                        nodeColor      ? nodeColor  :
                        'white'
                      }
                      fillOpacity={nodeColor && !isGnd && !isWiringAnchor ? 0.3 : 1}
                      stroke={isWiringAnchor ? '#2563eb' : nodeColor ?? color}
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

        {/* ---- Node rings (always visible after solve) + hover badge ---- */}
        {showNodes && components.flatMap(c =>
          ([c.pin1, getPin2(c)] as const).flatMap(pin => {
            const nodeId = nodeHighlights!.get(gk(pin));
            if (nodeId === undefined) return [];
            const isDragged = dragState?.id === c.id && isActivelyDragging;
            const renderPin = isDragged && mouseGrid
              ? (gridEq(pin, c.pin1)
                  ? getDragPreviewPin1(dragState!, mouseGrid)
                  : getPin2({ ...c, pin1: getDragPreviewPin1(dragState!, mouseGrid) }))
              : pin;
            const s = toScreen(renderPin);
            const color = NODE_COLORS[nodeId % NODE_COLORS.length];
            const pinKey = gk(pin);
            const isHovered = hoveredPinKey === pinKey;

            const v = nodeVoltages![nodeId];
            const label = fmtShortV(v);
            const badgeW = Math.max(label.length * 5.6 + 28, 52);

            return [
              // Subtle ring — always shown
              <circle
                key={`ring-${pinKey}`}
                cx={s.x} cy={s.y} r={9}
                fill={color} fillOpacity={0.12}
                stroke={color} strokeWidth={1.5}
                pointerEvents="none"
              />,
              // Voltage badge — only on hover
              isHovered && (
                <g key={`badge-${pinKey}`} pointerEvents="none">
                  <rect
                    x={s.x - badgeW / 2} y={s.y - 32}
                    width={badgeW} height={16} rx={4}
                    fill="white" fillOpacity={0.95}
                    stroke={color} strokeWidth={1.2}
                  />
                  <text
                    x={s.x} y={s.y - 21}
                    textAnchor="middle" fontSize={9.5}
                    fill={color} fontWeight="700"
                    fontFamily="'Courier New', monospace"
                  >
                    N{nodeId} · {label}
                  </text>
                </g>
              ),
            ].filter(Boolean) as JSX.Element[];
          })
        )}

        {/* ---- Ghost preview (while placing) ---- */}
        {pendingType && mouseGrid && (() => {
          const s = toScreen(mouseGrid);
          const ghost: PlacedComponent = {
            id: '__ghost__', type: pendingType, value: defaultValue(pendingType),
            pin1: mouseGrid, rotation: pendingRot,
          };
          const s2 = toScreen(getPin2(ghost));
          return (
            <g opacity={0.45} pointerEvents="none">
              <g transform={`translate(${s.x},${s.y}) rotate(${pendingRot})`} style={{ color: '#2563eb' }}>
                <ComponentShape type={pendingType} />
              </g>
              <circle cx={s.x}  cy={s.y}  r={PIN_R} fill="white" stroke="#2563eb" strokeWidth={1.5} />
              <circle cx={s2.x} cy={s2.y} r={PIN_R} fill="white" stroke="#2563eb" strokeWidth={1.5} />
            </g>
          );
        })()}
      </svg>

      {/* ---- Selected component inline editor ---- */}
      {selectedId && !isActivelyDragging && (() => {
        const c = components.find(x => x.id === selectedId);
        if (!c) return null;
        const rotateSelected = () =>
          onChange({
            ...schematic,
            components: schematic.components.map(x =>
              x.id === selectedId ? { ...x, rotation: nextRotation(x.rotation) } : x
            ),
          });
        return (
          <div className="inline-editor">
            <span className="inline-editor-label">
              {c.type === 'R' ? 'Resistance' : c.type === 'V' ? 'Voltage' : 'Current'}
            </span>
            <input
              type="number" step="any"
              defaultValue={c.value}
              onBlur={e  => updateValue(c.id, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') updateValue(c.id, (e.target as HTMLInputElement).value); }}
              autoFocus
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
                  components: schematic.components.filter(x => x.id !== selectedId),
                  wires: schematic.wires.filter(w =>
                    !allPins().filter(p => p.componentId === selectedId).some(
                      p => gridEq(p.pt, w.from) || gridEq(p.pt, w.to)
                    )
                  ),
                });
                setSelectedId(null);
              }}
            >Delete</button>
          </div>
        );
      })()}
    </div>
  );
}

function defaultValue(t: BranchType): number {
  if (t === 'R') return 1000;
  if (t === 'V') return 10;
  return 0.001;
}
