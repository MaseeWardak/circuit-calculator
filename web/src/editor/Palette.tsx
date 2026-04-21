import type { ToolType } from './types';

interface Props {
  selected: ToolType | null;
  onSelect: (t: ToolType | null) => void;
}

interface PaletteItem {
  type: ToolType;
  label: string;
  symbol: string;
  description: string;
}

const ITEMS: PaletteItem[] = [
  // ── Independent sources ──────────────────────────────────
  { type: 'R',  label: 'Resistor',       symbol: '⬡', description: 'Linear resistor (Ohm\'s law)'          },
  { type: 'V',  label: 'Voltage Source', symbol: '⊕', description: 'Independent DC voltage source'         },
  { type: 'I',  label: 'Current Source', symbol: '⊙', description: 'Independent DC current source'         },
  // ── Dependent sources ────────────────────────────────────
  { type: 'G',  label: 'VCCS',           symbol: '◇I', description: 'Voltage-controlled current source (gm)'  },
  { type: 'E',  label: 'VCVS',           symbol: '◇V', description: 'Voltage-controlled voltage source (μ)'   },
  { type: 'F',  label: 'CCCS',           symbol: '◆I', description: 'Current-controlled current source (β)'  },
  { type: 'H',  label: 'CCVS',           symbol: '◆V', description: 'Current-controlled voltage source (rm)' },
  // ── Passive utilities ────────────────────────────────────
  { type: 'OC', label: 'Open Circuit',   symbol: '⊸',  description: 'Open-circuit probe (no current flows)' },
  { type: 'A',  label: 'Current Probe',  symbol: 'Ⓐ',  description: 'Ammeter — place in series, label it (e.g. i1), then reference it from CCCS/CCVS' },
  // ── Net label ────────────────────────────────────────────
  { type: 'L',  label: 'Net Label',      symbol: '🏷', description: 'Named net — two matching labels connect electrically' },
  // ── Thévenin / Norton port markers ───────────────────────
  { type: 'PA', label: 'Port A',         symbol: 'Ⓐ',  description: 'Mark a node as Thévenin/Norton terminal a — click a wire junction' },
  { type: 'PB', label: 'Port B',         symbol: 'Ⓑ',  description: 'Mark a node as Thévenin/Norton terminal b — click a wire junction' },
];

const GROUPS = [
  { title: 'Independent',  types: ['R', 'V', 'I'] as ToolType[] },
  { title: 'Dependent',    types: ['G', 'E', 'F', 'H'] as ToolType[] },
  { title: 'Utility',      types: ['OC', 'A', 'L'] as ToolType[] },
  { title: 'Analysis',     types: ['PA', 'PB'] as ToolType[] },
];

export default function Palette({ selected, onSelect }: Props) {
  return (
    <div className="palette">
      <h3 className="palette-title">Components</h3>

      {GROUPS.map(group => (
        <div key={group.title} className="palette-group">
          <span className="palette-group-label">{group.title}</span>
          <div className="palette-items">
            {ITEMS
              .filter(item => group.types.includes(item.type))
              .map(item => (
                <button
                  key={item.type}
                  className={`palette-item ${selected === item.type ? 'active' : ''}`}
                  onClick={() => onSelect(selected === item.type ? null : item.type)}
                  title={item.description}
                >
                  <span className="palette-symbol">{item.symbol}</span>
                  <span className="palette-label">{item.label}</span>
                </button>
              ))}
          </div>
        </div>
      ))}

      <div className="palette-hints">
        <h3 className="palette-title" style={{ marginTop: '1.2rem' }}>Controls</h3>
        <ul className="hints-list">
          <li><kbd>Click</kbd> palette → place</li>
          <li><kbd>Shift+Click</kbd> → keep placing</li>
          <li><kbd>R</kbd> → rotate 0→90→180→270</li>
          <li><kbd>Click</kbd> pin → start wire</li>
          <li><kbd>Right-click</kbd> pin → set GND</li>
          <li><kbd>Click</kbd> wire → delete it</li>
          <li><kbd>Click</kbd> ○ junction → continue wire</li>
          <li><kbd>Del</kbd> → delete selected</li>
          <li><kbd>Esc</kbd> → cancel</li>
          <li style={{ marginTop: '.4rem', color: 'var(--muted)' }}>
            Dependent sources are 2-terminal.<br/>
            After placing, click again to set value &amp; Control.<br/>
            <br/>
            <b>Voltage control (VCCS/VCVS):</b><br/>
            Label any component "Vx" — its terminal voltage becomes Vx.<br/>
            <br/>
            <b>Current control (CCCS/CCVS):</b><br/>
            Place a <b>Current Probe (A)</b> in series and label it "i1".<br/>
            Or label a resistor "i1" (I = V/R).<br/>
            <br/>
            <b>Thévenin / Norton:</b><br/>
            Place <b>Port A</b> and <b>Port B</b> on two circuit nodes,<br/>
            then Solve — V_th, I_N and R_th appear in Results.
          </li>
        </ul>
      </div>
    </div>
  );
}
