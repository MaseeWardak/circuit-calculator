import type { Branch, SolveResult } from '../types/circuit';
import { BRANCH_LABELS } from '../types/circuit';
import { NODE_COLORS } from '../editor/constants';

interface Props {
  result: SolveResult | null;
  branches: Branch[];
}

function fmt(v: number): string {
  const abs = Math.abs(v);
  if (abs === 0)   return '0';
  if (abs >= 1e6)  return (v / 1e6).toPrecision(4) + ' M';
  if (abs >= 1e3)  return (v / 1e3).toPrecision(4) + ' k';
  if (abs >= 1)    return v.toPrecision(4);
  if (abs >= 1e-3) return (v * 1e3).toPrecision(4) + ' m';
  if (abs >= 1e-6) return (v * 1e6).toPrecision(4) + ' µ';
  return (v * 1e9).toPrecision(4) + ' n';
}

export default function ResultsPanel({ result, branches }: Props) {
  if (result === null) {
    return (
      <div className="results-panel results-empty">
        <p>Build a circuit and click <strong>⚡ Solve</strong>.</p>
        <p style={{ marginTop: '.5rem', fontSize: '.82rem' }}>
          Nodes will be highlighted on the canvas after solving.
        </p>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="results-panel results-error">
        <h3>⚠ Solver Error</h3>
        <p>{result.error}</p>
      </div>
    );
  }

  return (
    <div className="results-panel results-ok">
      <h3>Node Voltages</h3>
      <table className="results-table">
        <thead>
          <tr>
            <th>Node</th>
            <th style={{ textAlign: 'right' }}>Voltage</th>
          </tr>
        </thead>
        <tbody>
          {result.node_voltages.map((v, i) => {
            const color = NODE_COLORS[i % NODE_COLORS.length];
            return (
              <tr key={i}>
                <td>
                  <span className="node-dot" style={{ background: color }} />
                  {i === 0 ? 'N0 — GND' : `N${i}`}
                </td>
                <td className="num-cell">{fmt(v)} V</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Branch Currents</h3>
      <table className="results-table">
        <thead>
          <tr><th>#</th><th>Element</th><th>Nodes</th><th style={{ textAlign: 'right' }}>Current</th></tr>
        </thead>
        <tbody>
          {result.branch_currents.map((cur, i) => {
            const br = branches[i];
            if (!br) return null;
            const meta = BRANCH_LABELS[br.type];
            return (
              <tr key={i}>
                <td className="row-num">{i + 1}</td>
                <td>{meta.name}</td>
                <td style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  <span className="node-dot" style={{ background: NODE_COLORS[br.n1 % NODE_COLORS.length] }} />
                  N{br.n1} →{' '}
                  <span className="node-dot" style={{ background: NODE_COLORS[br.n2 % NODE_COLORS.length] }} />
                  N{br.n2}
                </td>
                <td className="num-cell">{fmt(cur)} A</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
