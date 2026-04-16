# Circuit Calculator — codebase guide

This repository is a **C++17** project that builds a small static library (`circuitcalc`) plus an optional command-line demo. The layout follows a common pattern: **public headers** under `include/`, **implementations** under `src/`, and **applications** under `apps/`.

## Directory layout

| Path | Role |
|------|------|
| `CMakeLists.txt` | Root CMake project: C++ standard, `circuitcalc` library, optional `circuitcalc_cli` executable. |
| `include/circuitcalc/` | Installed-style API: core utilities, netlist, and analysis headers. Consumers use `#include "circuitcalc/..."`. |
| `src/` | `.cpp` files implementing the library (keeps compile times reasonable vs. header-only). |
| `apps/cli/` | Thin `main.cpp` that demonstrates library usage (voltage divider). |

### `include/circuitcalc/` modules

- **`circuitcalc.hpp`** — Umbrella header that pulls in the main public types for quick experiments.
- **`core/`** — Cross-cutting building blocks:
  - `errors.hpp` — `circuit_error`, `singular_matrix_error` for solver failures.
  - `units.hpp` — Helpers such as `apply_si_suffix` for human-entered values (e.g. `4.7` + `"k"`).
  - `matrix.hpp` (+ `src/core/matrix.cpp`) — Dense matrix stored as a **row-major `double*` heap array**; Gaussian elimination with partial pivoting (no third-party linear algebra).
- **`netlist/`** — `Netlist` stores ideal **resistors**, **current sources**, and **voltage sources** in **fixed-size C-style arrays** (`kMaxResistors`, etc.) with separate `*_count()` fields. Node `0` is the **reference (ground)**; all other nodes are non-negative integers.
- **`analysis/`** — Solvers and result types:
  - `analysis_result.hpp` (+ `src/analysis/analysis_result.cpp`) — `DcAnalysisResult` holds `double*` arrays for node voltages and floating-source currents, with `delete[]` in the destructor (RAII).
  - `dc_solver.hpp` (+ `src/analysis/dc_solver.cpp`) — **Modified nodal analysis (MNA)** for linear DC resistive circuits: resistors stamp conductances; current sources contribute to the RHS; voltage sources are either **ground-referenced** (one terminal at node `0`, row constraint) or **floating** (extra MNA variable for source current).

## Data flow

1. Build a `Netlist`: `set_node_count`, then `add_resistor` / `add_current_source` / `add_voltage_source`.
2. Run `DcSolver::solve(netlist)` → `DcAnalysisResult` with `node_voltage[i]` = \(V_i\) (with \(V_0 = 0\)).

## Build

Configure and build with CMake (out-of-source build recommended):

```bash
cmake -S . -B build
cmake --build build --config Release
```

On Windows with MSVC, the demo binary is typically `build/Release/circuitcalc_cli.exe` (or under `build/` depending on the generator).

## Extension points (typical next steps)

- **Parser / front-end**: Read SPICE-like netlists or a custom schematic DSL into `Netlist`.
- **AC / dynamics**: Add complex-valued MNA at frequency \(\omega\), or companion models for transient simulation.
- **Numerics**: Swap the dense solver for a sparse direct or iterative solver as network size grows.
- **Tests**: Add Catch2/GoogleTest under `tests/` and link against `circuitcalc`.

This file describes the **boilerplate structure** only; behavior is intentionally minimal and linear DC-focused.
