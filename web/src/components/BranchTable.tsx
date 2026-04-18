import type { Branch, BranchType } from '../types/circuit';
import { BRANCH_LABELS } from '../types/circuit';

interface Props {
  branches: Branch[];
  onChange: (branches: Branch[]) => void;
}

const TYPES: BranchType[] = ['R', 'V', 'I'];

export default function BranchTable({ branches, onChange }: Props) {
  const update = (index: number, patch: Partial<Branch>) => {
    onChange(branches.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const remove = (index: number) => {
    onChange(branches.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...branches, { type: 'R', n1: 1, n2: 0, value: 1000 }]);
  };

  return (
    <div className="branch-table-wrapper">
      <table className="branch-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Node +/A</th>
            <th>Node −/B</th>
            <th>Value</th>
            <th>Unit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {branches.map((b, i) => {
            const meta = BRANCH_LABELS[b.type];
            return (
              <tr key={i}>
                <td className="row-num">{i + 1}</td>
                <td>
                  <select
                    value={b.type}
                    onChange={e => update(i, { type: e.target.value as BranchType })}
                  >
                    {TYPES.map(t => (
                      <option key={t} value={t}>{BRANCH_LABELS[t].name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={b.n1}
                    onChange={e => update(i, { n1: parseInt(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={b.n2}
                    onChange={e => update(i, { n2: parseInt(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    placeholder={meta.placeholder}
                    value={b.value}
                    onChange={e => update(i, { value: parseFloat(e.target.value) || 0 })}
                  />
                </td>
                <td className="unit-label">{meta.unit}</td>
                <td>
                  <button
                    className="remove-btn"
                    onClick={() => remove(i)}
                    title="Remove branch"
                  >✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button className="add-btn" onClick={add}>+ Add Branch</button>
    </div>
  );
}
