import { useState } from 'react';
import EditorCanvas from './editor/EditorCanvas';
import Palette      from './editor/Palette';
import ResultsPanel from './components/ResultsPanel';
import type { ToolType, Schematic } from './editor/types';
import { schematicToNetlistWithNodeMap } from './editor/toNetlist';
import { solve } from './lib/solver';
import { solveCircuit } from './lib/mna';
import type { Branch, CircuitInput, SolveResult } from './types/circuit';
import { gk } from './editor/utils';
import type { TheveninResult } from './types/thevenin';

// ---------------------------------------------------------------------------
// Kill all independent sources for the test-source Rth method.
// Voltage sources → 0 V (short), current sources → 0 A.
// Dependent sources and CurrentProbes are kept.
// ---------------------------------------------------------------------------
function killIndependent(branches: Branch[]): Branch[] {
  return branches.map(br => {
    // Real independent V source (not a current probe A→V, not a VCVS/CCVS)
    const isIndepV = br.type === 'V' && br.displayType !== 'A';
    const isIndepI = br.type === 'I';
    if (isIndepV || isIndepI) return { ...br, value: 0 };
    return br;
  });
}

// ---------------------------------------------------------------------------
// Compute Thévenin/Norton from an already-solved circuit.
// ---------------------------------------------------------------------------
function computeThevenin(
  netlist: CircuitInput,
  nA: number,
  nB: number,
  solved: { ok: true; node_voltages: number[]; branch_currents: number[] },
): TheveninResult {
  const V_th = solved.node_voltages[nA] - solved.node_voltages[nB];
  let   I_N:  number | null = null;
  let   R_th: number | null = null;
  let   note: string | undefined;

  // ── Method 1: short-circuit (0 V source between A and B) ─────────────────
  try {
    const scNetlist: CircuitInput = {
      node_count: netlist.node_count,
      branches:   [...netlist.branches, { type: 'V', n1: nA, n2: nB, value: 0 }],
    };
    const sc = solveCircuit(scNetlist);
    if (sc.ok) {
      // MNA extra unknown convention: I_vs = current entering n1 (nA) from VS.
      // Norton current flows a→b through external = into nA from inside circuit = opposite.
      const I_vs = sc.branch_currents[sc.branch_currents.length - 1];
      I_N  = -I_vs;
      if (Math.abs(I_N) > 1e-14) R_th = V_th / I_N;
    }
  } catch {
    note = 'Short-circuit solve failed (port may be across a voltage source).';
  }

  // ── Method 2: test-source (1 V source, independent sources killed) ────────
  if (R_th === null) {
    try {
      const killed = killIndependent(netlist.branches);
      const testNetlist: CircuitInput = {
        node_count: netlist.node_count,
        branches:   [...killed, { type: 'V', n1: nA, n2: nB, value: 1 }],
      };
      const ts = solveCircuit(testNetlist);
      if (ts.ok) {
        const I_test = ts.branch_currents[ts.branch_currents.length - 1];
        R_th = Math.abs(I_test) > 1e-14 ? 1 / I_test : null;
        if (I_N === null) I_N = 0;
      }
    } catch {
      note = (note ?? '') + ' Test-source solve also failed.';
    }
  }

  return {
    V_th,
    I_N:   I_N ?? 0,
    R_th,
    portANode: nA,
    portBNode: nB,
    error: note,
  };
}

// ---------------------------------------------------------------------------
// Empty schematic
// ---------------------------------------------------------------------------
const EMPTY_SCHEMATIC: Schematic = {
  components:  [],
  wires:       [],
  labels:      [],
  groundPoint: null,
  portA:       null,
  portB:       null,
};

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [schematic, setSchematic]     = useState<Schematic>(EMPTY_SCHEMATIC);
  const [pendingType, setPendingType] = useState<ToolType | null>(null);
  const [result, setResult]           = useState<SolveResult | null>(null);
  const [solving, setSolving]         = useState(false);
  const [solveError, setSolveError]   = useState<string | null>(null);
  const [netlistBranches, setNetlistBranches] = useState<Branch[]>([]);
  const [animateMode, setAnimateMode] = useState(false);

  // Node overlay state
  const [pinToNode, setPinToNode]         = useState<Map<string, number> | null>(null);
  const [nodeVoltages, setNodeVoltages]   = useState<number[] | null>(null);

  // Thévenin / Norton
  const [theveninResult, setTheveninResult] = useState<TheveninResult | null>(null);

  // Full netlist (for solution steps)
  const [circuitInput, setCircuitInput]     = useState<CircuitInput | null>(null);

  const handleSchematicChange = (s: Schematic) => {
    setSchematic(s);
    setPinToNode(null);
    setNodeVoltages(null);
    setResult(null);
    setSolveError(null);
    setAnimateMode(false);
    setTheveninResult(null);
    setCircuitInput(null);
  };

  const handleSolve = async () => {
    setSolving(true);
    setResult(null);
    setSolveError(null);
    setPinToNode(null);
    setNodeVoltages(null);
    setTheveninResult(null);
    setCircuitInput(null);
    try {
      const { netlist, pinToNode: ptn } = schematicToNetlistWithNodeMap(schematic);
      setNetlistBranches(netlist.branches);
      setCircuitInput(netlist);
      const r = await solve(netlist);
      setResult(r);
      if (r.ok) {
        setPinToNode(ptn);
        setNodeVoltages(r.node_voltages);

        // Compute Thévenin / Norton if both port markers are set
        if (schematic.portA && schematic.portB) {
          const nA = ptn.get(gk(schematic.portA));
          const nB = ptn.get(gk(schematic.portB));
          if (nA !== undefined && nB !== undefined) {
            setTheveninResult(computeThevenin(netlist, nA, nB, r));
          } else {
            setTheveninResult({
              V_th: 0, I_N: 0, R_th: null,
              portANode: -1, portBNode: -1,
              error: 'Port A or Port B is not connected to the circuit. Place port markers on wire junctions.',
            });
          }
        }
      }
    } catch (e) {
      setSolveError((e as Error).message);
    } finally {
      setSolving(false);
    }
  };

  const handleClear = () => {
    setSchematic(EMPTY_SCHEMATIC);
    setResult(null);
    setSolveError(null);
    setPendingType(null);
    setPinToNode(null);
    setNodeVoltages(null);
    setNetlistBranches([]);
    setAnimateMode(false);
    setTheveninResult(null);
    setCircuitInput(null);
  };

  const PENDING_LABELS: Record<string, string> = {
    R: 'Resistor', V: 'Voltage Source', I: 'Current Source',
    G: 'VCCS', E: 'VCVS', F: 'CCCS', H: 'CCVS',
    OC: 'Open Circuit', A: 'Current Probe', L: 'Net Label',
    PA: 'Port A', PB: 'Port B',
  };
  const DEPENDENT_HINT: Record<string, string> = {
    G:  'VCCS — place, then click again to set gm and the voltage control variable (e.g. Vx)',
    E:  'VCVS — place, then click again to set gain μ and the voltage control variable (e.g. Vx)',
    F:  'CCCS — place, then click again to set β and the current control variable (e.g. Ix)',
    H:  'CCVS — place, then click again to set rm and the current control variable (e.g. Ix)',
    PA: 'Placing Port A — click a wire junction · Solve to compute Thévenin/Norton · Esc to cancel',
    PB: 'Placing Port B — click a wire junction · Solve to compute Thévenin/Norton · Esc to cancel',
  };
  const hintText = pendingType
    ? pendingType === 'L'
      ? 'Placing Net Label — click canvas · Shift+click to keep placing · Esc to cancel'
      : DEPENDENT_HINT[pendingType]
        ?? `Placing ${PENDING_LABELS[pendingType] ?? pendingType} — click canvas · R to rotate · Shift+click to keep placing · Esc to cancel`
    : 'Select a component from the palette, or click a pin to start a wire';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>Mr Goose Circuit Calculator</h1>
          <p className="subtitle">DC analysis — R, V, I, VCCS, VCVS, CCCS, CCVS &amp; net labels</p>
        </div>
        <div className="header-actions">
          <button
            className="header-btn danger"
            onClick={handleClear}
            title="Clear canvas"
          >
            Clear
          </button>
          <button
            className="header-btn solve"
            onClick={handleSolve}
            disabled={solving || schematic.components.length === 0}
            title="Run DC analysis"
          >
            {solving ? 'Solving…' : 'Solve'}
          </button>
          {result?.ok && (
            <button
              className={`header-btn visualize${animateMode ? ' active' : ''}`}
              onClick={() => setAnimateMode(m => !m)}
              title="Toggle current & voltage visualization"
            >
              {animateMode ? '⏹ Stop' : '▶ Visualize'}
            </button>
          )}
        </div>
      </header>

      <main className="app-main-editor">
        {/* ---- Left: palette ---- */}
        <aside className="sidebar">
          <Palette selected={pendingType} onSelect={setPendingType} />
        </aside>

        {/* ---- Centre: canvas ---- */}
        <section className="canvas-area">
          <EditorCanvas
            schematic={schematic}
            onChange={handleSchematicChange}
            pendingType={pendingType}
            onPendingTypeChange={setPendingType}
            nodeHighlights={pinToNode}
            nodeVoltages={nodeVoltages}
            placementHint={hintText}
            animateMode={animateMode}
            branchCurrents={result?.ok ? result.branch_currents : null}
            netlistBranches={netlistBranches}
          />
        </section>

        {/* ---- Right: results ---- */}
        <section className="results-area card">
          <h2>Results</h2>
          {solveError && (
            <div className="results-panel results-error">
              <h3>⚠ Error</h3>
              <p>{solveError}</p>
            </div>
          )}
          {!solveError && (
            <ResultsPanel
              result={result}
              branches={netlistBranches}
              circuitInput={circuitInput}
              thevenin={theveninResult}
            />
          )}
        </section>
      </main>

      <footer className="app-footer">
        C++ reference engine · TypeScript MNA in browser · Vite + React
      </footer>
    </div>
  );
}
