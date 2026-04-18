import { useState } from 'react';
import EditorCanvas from './editor/EditorCanvas';
import Palette      from './editor/Palette';
import ResultsPanel from './components/ResultsPanel';
import type { BranchType, Schematic } from './editor/types';
import { schematicToNetlist, schematicToNetlistWithNodeMap } from './editor/toNetlist';
import { solve } from './lib/solver';
import type { Branch, SolveResult } from './types/circuit';

const EMPTY_SCHEMATIC: Schematic = {
  components: [],
  wires:      [],
  groundPoint: null,
};

export default function App() {
  const [schematic, setSchematic]     = useState<Schematic>(EMPTY_SCHEMATIC);
  const [pendingType, setPendingType] = useState<BranchType | null>(null);
  const [result, setResult]           = useState<SolveResult | null>(null);
  const [solving, setSolving]         = useState(false);
  const [solveError, setSolveError]   = useState<string | null>(null);
  const [showNetlist, setShowNetlist] = useState(false);

  // Node overlay state — populated after a successful solve, cleared on change
  const [pinToNode, setPinToNode]     = useState<Map<string, number> | null>(null);
  const [nodeVoltages, setNodeVoltages] = useState<number[] | null>(null);

  const handleSchematicChange = (s: Schematic) => {
    setSchematic(s);
    // Clear overlays when the user edits the circuit
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
  };

  // Branches in netlist order for the ResultsPanel
  const netlistBranches: Branch[] = schematic.components.map(c => ({
    type: c.type, n1: 0, n2: 0, value: c.value,
  }));

  let netlistJson: string | null = null;
  if (showNetlist) {
    try {
      netlistJson = JSON.stringify(schematicToNetlist(schematic), null, 2);
    } catch {
      netlistJson = null;
    }
  }

  const hintText = pendingType
    ? `Placing ${pendingType === 'R' ? 'Resistor' : pendingType === 'V' ? 'Voltage Source' : 'Current Source'} — click canvas · R to cycle rotation · Shift+click to keep placing · Esc to cancel`
    : 'Select a component from the palette, or click a pin to start a wire';

  return (
    <div className="app">
      <header className="app-header">
        <span className="header-icon">⚡</span>
        <div>
          <h1>Circuit Calculator</h1>
          <p className="subtitle">DC analysis — resistors, voltage &amp; current sources</p>
        </div>
      </header>

      <main className="app-main-editor">
        {/* ---- Left: palette ---- */}
        <aside className="sidebar">
          <Palette selected={pendingType} onSelect={setPendingType} />
        </aside>

        {/* ---- Centre: canvas ---- */}
        <section className="canvas-area">
          <div className="canvas-toolbar">
            <span className="toolbar-hint">{hintText}</span>
            <div className="toolbar-actions">
              <button
                className="toolbar-btn"
                onClick={() => setShowNetlist(s => !s)}
                title="Toggle netlist JSON view"
              >
                {showNetlist ? 'Hide JSON' : 'Show JSON'}
              </button>
              <button className="toolbar-btn danger" onClick={handleClear}>Clear</button>
              <button
                className="solve-btn-sm"
                onClick={handleSolve}
                disabled={solving || schematic.components.length === 0}
              >
                {solving ? 'Solving…' : '⚡ Solve'}
              </button>
            </div>
          </div>

          <EditorCanvas
            schematic={schematic}
            onChange={handleSchematicChange}
            pendingType={pendingType}
            onPendingTypeChange={setPendingType}
            nodeHighlights={pinToNode}
            nodeVoltages={nodeVoltages}
          />

          {showNetlist && (
            <pre className="netlist-preview">
              {netlistJson ?? '// Cannot generate netlist — check circuit connections.'}
            </pre>
          )}
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
