# Mr Goose Circuit Calculator — codebase guide

This repository is a **C++17** static library (`circuitcalc`) plus a **Vite + React** web app (`web/`) for **DC modified nodal analysis** of linear circuits. The in-browser **Solver** path uses the **TypeScript** MNA implementation (`web/src/lib/mna.ts`); the C++ code is the reference engine, optional **WASM** (when built and re-enabled in `solver.ts`), and the **CLI** demo.

**Full file-by-file documentation** (1500+ lines) lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Directory layout

| Path | Role |
|------|------|
| `CMakeLists.txt` | Root CMake: `circuitcalc` library, optional `circuitcalc_cli`, optional Emscripten WASM. |
| `include/circuitcalc/` | Public C++ API: `netlist/`, `analysis/`, `core/`, `io/`, `circuit/`. |
| `src/` | C++ implementations (MNA, matrix, JSON I/O, etc.). |
| `apps/cli/` | `main.cpp` — small linear-DC examples. |
| `apps/wasm/` | Emscripten `wasm_api.cpp` — JSON in/out for the browser. |
| `web/` | **Mr Goose Circuit Calculator** UI: schematic editor, `toNetlist` (union–find), TS solver, results, Thévenin/Norton, solution steps, visualization. |

## Web app (`web/`) at a glance

| Path | Role |
|------|------|
| `src/App.tsx` | Layout, solve pipeline, visualize toggle, Thévenin computation, circuit state. |
| `src/editor/` | SVG canvas (`EditorCanvas`), palette, netlist conversion (`toNetlist.ts`), shapes. |
| `src/lib/solver.ts` | Solver entry — **WASM load is currently disabled** (legacy binary vs JSON contract); uses `mna.ts`. |
| `src/lib/mna.ts` | Canonical in-browser DC MNA (R, V, I, G, E, F, H, probes). |
| `src/lib/solutionSteps.ts` | Builds collapsible educational “solution steps” after a successful solve. |
| `src/types/circuit.ts` | Branch types and JSON-shaped types shared by solver and UI. |
| `src/types/thevenin.ts` | `TheveninResult` for port A/B equivalent values. |

## Native C++ build

```bash
cmake -S . -B build
cmake --build build --config Release
```

On Windows with MSVC or MinGW, run the CLI from `build/` (see `ARCHITECTURE.md` §16).

## Extension points

- Regenerate WASM with current JSON schema and re-enable loading in `web/src/lib/solver.ts` if you want the C++ engine in the browser.
- Add regression tests under `tests/` linking `circuitcalc`.
- AC/transient analysis would extend MNA beyond linear DC.

---

*For editor UX (wires, junctions, node colours), dependent sources, and data flow diagrams, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).*
