import { useState } from 'react';
import EditorCanvas from './editor/EditorCanvas';
import Palette      from './editor/Palette';
import ResultsPanel from './components/ResultsPanel';
import type { ToolType, Schematic } from './editor/types';
import { schematicToNetlistWithNodeMap } from './editor/toNetlist';
import { solve } from './lib/solver';
import type { Branch, SolveResult } from './types/circuit';

const EMPTY_SCHEMATIC: Schematic = {
  components:  [],
  wires:       [],
  labels:      [],
  groundPoint: null,
};

export default function App() {
  const [schematic, setSchematic]     = useState<Schematic>(EMPTY_SCHEMATIC);
  const [pendingType, setPendingType] = useState<ToolType | null>(null);
  const [result, setResult]           = useState<SolveResult | null>(null);
  const [solving, setSolving]         = useState(false);
  const [solveError, setSolveError]   = useState<string | null>(null);
  const [netlistBranches, setNetlistBranches] = useState<Branch[]>([]);

  // Node overlay state — populated after a successful solve, cleared on change
  const [pinToNode, setPinToNode]         = useState<Map<string, number> | null>(null);
  const [nodeVoltages, setNodeVoltages]   = useState<number[] | null>(null);

  const handleSchematicChange = (s: Schematic) => {
    setSchematic(s);
    setPinToNode(null);
    setNodeVoltages(null);
    setResult(null);
    setSolveError(null);
  };

  const handleSolve = async () => {
    setSolving(true);
    setResult(null);
    setSolveError(null);
    setPinToNode(null);
    setNodeVoltages(null);
    try {
      const { netlist, pinToNode: ptn } = schematicToNetlistWithNodeMap(schematic);
      // Capture real node assignments for the results panel
      setNetlistBranches(netlist.branches);
      const r = await solve(netlist);
      setResult(r);
      if (r.ok) {
        setPinToNode(ptn);
        setNodeVoltages(r.node_voltages);
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
  };

  const PENDING_LABELS: Record<string, string> = {
    R: 'Resistor', V: 'Voltage Source', I: 'Current Source',
    G: 'VCCS', E: 'VCVS', F: 'CCCS', H: 'CCVS',
    OC: 'Open Circuit', L: 'Net Label',
  };
  const hintText = pendingType
    ? pendingType === 'L'
      ? 'Placing Net Label — click canvas · Shift+click to keep placing · Esc to cancel'
      : `Placing ${PENDING_LABELS[pendingType] ?? pendingType} — click canvas · R to rotate · Shift+click to keep placing · Esc to cancel`
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
            <ResultsPanel result={result} branches={netlistBranches} />
          )}
        </section>
      </main>

      <footer className="app-footer">
        C++ MNA engine · TypeScript UI ·{' '}
        <a href="https://github.com/search?q=circuit-calculator" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
