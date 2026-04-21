import { useState } from 'react';
import type { Branch, CircuitInput, SolveResult, DisplayBranchType } from '../types/circuit';
import { BRANCH_LABELS } from '../types/circuit';
import { NODE_COLORS } from '../editor/constants';
import type { TheveninResult } from '../types/thevenin';
import { generateSolutionSteps } from '../lib/solutionSteps';
import type { SolutionSection } from '../lib/solutionSteps';

interface Props {
  result:        SolveResult | null;
  branches:      Branch[];
  circuitInput?: CircuitInput | null;
  thevenin?:     TheveninResult | null;
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

function fmtR(v: number | null): string {
  if (v === null) return '—';
  const abs = Math.abs(v);
  if (!isFinite(abs)) return '∞ Ω';
  if (abs === 0) return '0 Ω';
  if (abs >= 1e6)  return (v / 1e6).toPrecision(4) + ' MΩ';
  if (abs >= 1e3)  return (v / 1e3).toPrecision(4) + ' kΩ';
  if (abs >= 1)    return v.toPrecision(4) + ' Ω';
  if (abs >= 1e-3) return (v * 1e3).toPrecision(4) + ' mΩ';
  return v.toPrecision(4) + ' Ω';
}

// ── Solution-steps renderer ──────────────────────────────────────────────────
function SolutionSteps({ sections }: { sections: SolutionSection[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }));

  return (
    <div className="steps-root">
      {sections.map((sec, si) => {
        const isOpen = open[sec.title] ?? false;
        return (
          <div key={si} className="steps-section">
            <button
              className={`steps-toggle${isOpen ? ' open' : ''}`}
              onClick={() => toggle(sec.title)}
            >
              <span className="steps-toggle-arrow">{isOpen ? '▾' : '▸'}</span>
              {sec.title}
            </button>

            {isOpen && (
              <div className="steps-body">
                {sec.lines.map((ln, li) => {
                  if (ln.kind === 'sep')     return <div key={li} className="steps-sep" />;
                  if (ln.kind === 'heading') return <div key={li} className="steps-heading">{ln.text}</div>;
                  if (ln.kind === 'eq')      return <pre key={li} className="steps-eq">{ln.text}</pre>;
                  if (ln.kind === 'ok')      return <pre key={li} className="steps-ok">{ln.text}</pre>;
                  if (ln.kind === 'warn')    return <pre key={li} className="steps-warn">{ln.text}</pre>;
                  return <p key={li} className="steps-text">{ln.text}</p>;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ResultsPanel({ result, branches, circuitInput, thevenin }: Props) {
  if (result === null) {
    return (
      <div className="results-panel results-empty">
        <p>Build a circuit and click <strong>Solve</strong>.</p>
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
            // displayType is set when CCCS/CCVS was converted to G/E, or A → V
            const displayType: DisplayBranchType = br.displayType ?? br.type;
            const meta = BRANCH_LABELS[displayType];
            return (
              <tr key={i}>
                <td className="row-num">{i + 1}</td>
                <td>{meta.name}</td>
                <td style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  <span className="node-dot" style={{ background: NODE_COLORS[br.n1 % NODE_COLORS.length] }} />
                  N{br.n1} →{' '}
                  <span className="node-dot" style={{ background: NODE_COLORS[br.n2 % NODE_COLORS.length] }} />
                  N{br.n2}
                  {br.nc1 !== undefined && br.nc2 !== undefined && (
                    <span style={{ opacity: 0.7 }}>
                      {' '}ctrl:{' '}
                      <span className="node-dot" style={{ background: NODE_COLORS[br.nc1 % NODE_COLORS.length] }} />
                      N{br.nc1}−
                      <span className="node-dot" style={{ background: NODE_COLORS[br.nc2 % NODE_COLORS.length] }} />
                      N{br.nc2}
                    </span>
                  )}
                  {br.vs_ctrl_idx !== undefined && (
                    <span style={{ opacity: 0.7 }}> ctrl: VS#{br.vs_ctrl_idx + 1}</span>
                  )}
                </td>
                <td className="num-cell">{fmt(cur)} A</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Solution steps ────────────────────────────────────────── */}
      {circuitInput && (
        <div style={{ marginTop: '1.2rem' }}>
          <h3 style={{
            fontSize: '.78rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.06em', color: 'var(--muted)', margin: '0 0 .5rem',
          }}>Solution Steps</h3>
          <SolutionSteps
            sections={generateSolutionSteps(
              circuitInput,
              { node_voltages: result.node_voltages, branch_currents: result.branch_currents },
              branches,
            )}
          />
        </div>
      )}

      {/* ── Thévenin / Norton ─────────────────────────────────────── */}
      {thevenin && (
        <div className="thevenin-panel">
          <h3 className="thevenin-title">Thévenin / Norton Equivalent</h3>
          <p className="thevenin-subtitle">
            Port a = N{thevenin.portANode} &nbsp;·&nbsp; Port b = N{thevenin.portBNode}
          </p>

          {thevenin.error && (
            <p className="thevenin-note">{thevenin.error}</p>
          )}

          <table className="results-table thevenin-table">
            <tbody>
              <tr>
                <td className="thevenin-param">V<sub>oc</sub> (= V<sub>th</sub>)</td>
                <td className="num-cell">{fmt(thevenin.V_th)} V</td>
                <td className="thevenin-hint">open-circuit voltage</td>
              </tr>
              <tr>
                <td className="thevenin-param">I<sub>sc</sub> (= I<sub>N</sub>)</td>
                <td className="num-cell">{fmt(thevenin.I_N)} A</td>
                <td className="thevenin-hint">short-circuit current a→b</td>
              </tr>
              <tr>
                <td className="thevenin-param">R<sub>th</sub> (= R<sub>N</sub>)</td>
                <td className="num-cell">{fmtR(thevenin.R_th)}</td>
                <td className="thevenin-hint">equivalent resistance</td>
              </tr>
            </tbody>
          </table>

          <div className="thevenin-circuits">
            {/* Thévenin equivalent */}
            <div className="thevenin-eq">
              <span className="thevenin-eq-label">Thévenin</span>
              <svg width="110" height="52" viewBox="0 0 110 52">
                <line x1="0" y1="12" x2="20" y2="12" stroke="#1e293b" strokeWidth="2"/>
                {/* Voltage source circle */}
                <circle cx="32" cy="12" r="12" fill="none" stroke="#7c3aed" strokeWidth="2"/>
                <text x="32" y="16" textAnchor="middle" fontSize="9" fill="#7c3aed" fontWeight="700">V</text>
                <line x1="44" y1="12" x2="60" y2="12" stroke="#1e293b" strokeWidth="2"/>
                {/* Resistor box */}
                <rect x="60" y="6" width="24" height="12" fill="none" stroke="#0369a1" strokeWidth="2" rx="2"/>
                <text x="72" y="15" textAnchor="middle" fontSize="8" fill="#0369a1" fontWeight="700">R</text>
                <line x1="84" y1="12" x2="110" y2="12" stroke="#1e293b" strokeWidth="2"/>
                {/* Lower wire */}
                <line x1="0" y1="40" x2="110" y2="40" stroke="#1e293b" strokeWidth="2"/>
                {/* Terminal lines */}
                <line x1="0" y1="12" x2="0" y2="40" stroke="#1e293b" strokeWidth="2"/>
                <line x1="110" y1="12" x2="110" y2="40" stroke="#1e293b" strokeWidth="2"/>
                {/* Terminal labels */}
                <text x="4" y="28" fontSize="9" fill="#7c3aed" fontWeight="700">a</text>
                <text x="100" y="28" fontSize="9" fill="#0369a1" fontWeight="700">b</text>
              </svg>
              <p className="thevenin-eq-val">{fmt(thevenin.V_th)} V · {fmtR(thevenin.R_th)}</p>
            </div>

            {/* Norton equivalent */}
            <div className="thevenin-eq">
              <span className="thevenin-eq-label">Norton</span>
              <svg width="110" height="52" viewBox="0 0 110 52">
                <line x1="0" y1="12" x2="35" y2="12" stroke="#1e293b" strokeWidth="2"/>
                <line x1="75" y1="12" x2="110" y2="12" stroke="#1e293b" strokeWidth="2"/>
                <line x1="0" y1="40" x2="110" y2="40" stroke="#1e293b" strokeWidth="2"/>
                <line x1="0" y1="12" x2="0" y2="40" stroke="#1e293b" strokeWidth="2"/>
                <line x1="110" y1="12" x2="110" y2="40" stroke="#1e293b" strokeWidth="2"/>
                {/* Current source */}
                <circle cx="42" cy="26" r="8" fill="none" stroke="#7c3aed" strokeWidth="2"/>
                <line x1="42" y1="12" x2="42" y2="18" stroke="#7c3aed" strokeWidth="2"/>
                <line x1="42" y1="34" x2="42" y2="40" stroke="#7c3aed" strokeWidth="2"/>
                <polygon points="42,20 39,24 45,24" fill="#7c3aed"/>
                {/* Resistor */}
                <rect x="63" y="12" width="12" height="28" fill="none" stroke="#0369a1" strokeWidth="2" rx="2"/>
                <text x="69" y="29" textAnchor="middle" fontSize="8" fill="#0369a1" fontWeight="700">R</text>
                {/* Terminal labels */}
                <text x="4" y="28" fontSize="9" fill="#7c3aed" fontWeight="700">a</text>
                <text x="100" y="28" fontSize="9" fill="#0369a1" fontWeight="700">b</text>
              </svg>
              <p className="thevenin-eq-val">{fmt(thevenin.I_N)} A · {fmtR(thevenin.R_th)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
