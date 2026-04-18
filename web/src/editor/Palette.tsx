import type { BranchType } from './types';

interface Props {
  selected: BranchType | null;
  onSelect: (t: BranchType | null) => void;
}

interface PaletteItem {
  type: BranchType;
  label: string;
  symbol: string;
  description: string;
}

const ITEMS: PaletteItem[] = [
  { type: 'R', label: 'Resistor',       symbol: '⬜', description: 'Linear resistor (Ohm\'s law)' },
  { type: 'V', label: 'Voltage Source', symbol: '⊕', description: 'Independent DC voltage source' },
  { type: 'I', label: 'Current Source', symbol: '⊙', description: 'Independent DC current source' },
];

export default function Palette({ selected, onSelect }: Props) {
  return (
    <div className="palette">
      <h3 className="palette-title">Components</h3>
      <div className="palette-items">
        {ITEMS.map(item => (
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
        </ul>
      </div>
    </div>
  );
}
