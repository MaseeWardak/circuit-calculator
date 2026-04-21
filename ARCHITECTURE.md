# Circuit Calculator — Architecture & Developer Guide

This document explains every file in the project, how all pieces fit together,
and the design decisions made along the way. It is written to be read top-to-bottom
by someone who wants to understand the full system before touching any code.

---

## Table of Contents

1. [Project overview](#1-project-overview)
2. [Repository layout](#2-repository-layout)
3. [Technology choices and rationale](#3-technology-choices-and-rationale)
4. [C++ core library — `circuitcalc`](#4-c-core-library--circuitcalc)
   - 4.1 [Circuit element classes — `elements.hpp`](#41-circuit-element-classes--elementshpp)
   - 4.2 [Hand-rolled linked list — `element_list.hpp / .cpp`](#42-hand-rolled-linked-list--element_listhpp--cpp)
   - 4.3 [Netlist — `netlist.hpp / .cpp`](#43-netlist--netlishpp--cpp)
   - 4.4 [Dense matrix — `matrix.hpp / .cpp`](#44-dense-matrix--matrixhpp--cpp)
   - 4.5 [Gaussian elimination](#45-gaussian-elimination)
   - 4.6 [DC solver — `dc_solver.hpp / .cpp`](#46-dc-solver--dc_solverhpp--cpp)
   - 4.7 [Modified Nodal Analysis (MNA) — the algorithm](#47-modified-nodal-analysis-mna--the-algorithm)
   - 4.8 [Analysis result — `analysis_result.hpp`](#48-analysis-result--analysis_resulthpp)
   - 4.9 [JSON I/O — `json_io.hpp / .cpp`](#49-json-io--json_iohpp--cpp)
   - 4.10 [Error types — `errors.hpp`](#410-error-types--errorshpp)
5. [Build system — `CMakeLists.txt`](#5-build-system--cmakeliststxt)
6. [CLI application — `apps/cli/main.cpp`](#6-cli-application--appsclimaincpp)
7. [WebAssembly bridge — `apps/wasm/wasm_api.cpp`](#7-webassembly-bridge--appswasm-wasm_apicpp)
8. [Emscripten build pipeline](#8-emscripten-build-pipeline)
9. [TypeScript / React frontend — `web/`](#9-typescript--react-frontend--web)
   - 9.1 [Entry point — `main.tsx` and `index.html`](#91-entry-point--maintsx-and-indexhtml)
   - 9.2 [Root component — `App.tsx`](#92-root-component--apptsx)
   - 9.3 [Shared circuit types — `types/circuit.ts`](#93-shared-circuit-types--typescircuitts)
   - 9.4 [Solver gateway — `lib/solver.ts`](#94-solver-gateway--libsolverts)
   - 9.5 [TypeScript MNA — `lib/mna.ts`](#95-typescript-mna--libmnats)
   - 9.6 [Solution steps — `lib/solutionSteps.ts`](#96-solution-steps--libsolutionstepsts)
10. [Schematic editor subsystem — `editor/`](#10-schematic-editor-subsystem--editor)
    - 10.1 [Constants — `constants.ts`](#101-constants--constantsts)
    - 10.2 [Types — `types.ts`](#102-types--typests)
    - 10.3 [Utilities — `utils.ts`](#103-utilities--utilsts)
    - 10.4 [Component shapes — `ComponentShape.tsx`](#104-component-shapes--componentshapetsx)
    - 10.5 [Palette sidebar — `Palette.tsx`](#105-palette-sidebar--palettetsx)
    - 10.6 [Netlist converter — `toNetlist.ts`](#106-netlist-converter--tonetlistts)
    - 10.7 [Editor canvas — `EditorCanvas.tsx`](#107-editor-canvas--editorcanvastsx)
11. [Results panel — `components/ResultsPanel.tsx`](#11-results-panel--componentsresultspaneltsx)
12. [Styling — `index.css`](#12-styling--indexcss)
13. [End-to-end data flow](#13-end-to-end-data-flow)
14. [Sign conventions used throughout](#14-sign-conventions-used-throughout)
15. [Known constraints and limits](#15-known-constraints-and-limits)
16. [How to build and run everything](#16-how-to-build-and-run-everything)

---

## 1. Project overview

**Mr Goose Circuit Calculator** is a browser-based DC circuit analysis tool. A user places
resistors, sources (including dependent sources), probes, and net labels on an interactive
SVG canvas, wires them, sets ground, and clicks **Solve**. The schematic is converted to a
netlist with union–find; **Modified Nodal Analysis (MNA)** yields node voltages and branch
currents. Results appear in the side panel with colour-coded node overlays on the schematic,
optional **current/voltage visualization**, **Thévenin/Norton** equivalents at marked ports,
and **collapsible solution steps** for teaching.

The **production browser path uses the TypeScript solver** (`web/src/lib/mna.ts`): it tracks
the full branch model (VCCS, VCVS, CCCS, CCVS, current probes). The C++ library (`circuitcalc`)
remains the reference implementation and powers the CLI; a WebAssembly build exists, but
**WASM loading in `solver.ts` is intentionally disabled** until a binary is rebuilt that matches
the current JSON netlist contract (older WASM crashes on dependent-source payloads).

The project simultaneously demonstrates:

- **C++ proficiency**: custom data structures (hand-rolled singly linked list),
  abstract base classes with virtual dispatch, manual memory management,
  a hand-written recursive-descent JSON parser, numerical linear algebra.
- **TypeScript / React proficiency**: a stateful SVG canvas editor with drag,
  multi-step interactions, Union-Find topology computation, and a full MNA
  solver ported directly from the C++.

---

## 2. Repository layout

```
circuit-calculator/
│
├── CMakeLists.txt              Build configuration (native + WASM)
├── .gitattributes              GitHub Linguist configuration
├── .gitignore
│
├── include/circuitcalc/        Public C++ headers
│   ├── circuitcalc.hpp         Umbrella include
│   ├── analysis/
│   │   ├── analysis_result.hpp DcAnalysisResult struct
│   │   └── dc_solver.hpp       DcSolver class declaration
│   ├── circuit/
│   │   ├── elements.hpp        CircuitElement, Resistor, CurrentSource, VoltageSource
│   │   └── element_list.hpp    ElementList (hand-rolled singly linked list)
│   ├── core/
│   │   ├── errors.hpp          circuit_error, singular_matrix_error
│   │   ├── matrix.hpp          Dense row-major matrix + Gaussian solve
│   │   └── units.hpp           (reserved for SI helpers)
│   ├── io/
│   │   └── json_io.hpp         JSON parse/serialise contract
│   └── netlist/
│       └── netlist.hpp         Netlist class (fixed-capacity arrays of entries)
│
├── src/                        C++ implementation files
│   ├── analysis/dc_solver.cpp
│   ├── circuit/element_list.cpp
│   ├── core/matrix.cpp
│   ├── io/json_io.cpp
│   └── netlist/netlist.cpp
│
├── apps/
│   ├── cli/main.cpp            Command-line golden test suite
│   └── wasm/wasm_api.cpp       Emscripten binding point
│
└── web/                        TypeScript / React / Vite frontend
    ├── index.html
    ├── vite.config.ts
    ├── package.json
    ├── public/
    │   └── wasm/               WASM build artefacts (not checked in)
    │       ├── circuitcalc_wasm.js
    │       └── circuitcalc_wasm.wasm
    └── src/
        ├── main.tsx            React entry point
        ├── App.tsx             Root component, solve orchestration
        ├── index.css           Global styles + Waterloo gold theme
        ├── types/
        │   ├── circuit.ts      Branch / JSON contract types (solver + UI)
        │   └── thevenin.ts     Thévenin/Norton result type
        ├── lib/
        │   ├── solver.ts       Solver entry (WASM optional; TS path active)
        │   ├── mna.ts          TypeScript MNA (canonical in-browser engine)
        │   └── solutionSteps.ts  Human-readable solution walkthrough
        ├── editor/
        │   ├── constants.ts    Grid dimensions, node colours
        │   ├── types.ts        PlacedComponent, Wire, Schematic types
        │   ├── utils.ts        getPin2, toScreen, snapToGrid, gk, gridEq
        │   ├── ComponentShape.tsx  SVG shapes for each element type
        │   ├── Palette.tsx     Component picker sidebar
        │   ├── toNetlist.ts    Union-Find schematic → netlist converter
        │   └── EditorCanvas.tsx    Interactive SVG canvas
        └── components/
            └── ResultsPanel.tsx    Results, steps, Thévenin/Norton section
```

---

## 3. Technology choices and rationale

| Layer | Technology | Why |
|---|---|---|
| Core solver | C++17 | Reference library + CLI; WASM optional when rebuilt and enabled |
| Build | CMake 3.20+ | Standard for cross-platform C++ including WASM targets |
| WASM bridge | Emscripten + `--bind` | Zero-dependency, runs in every modern browser |
| Frontend framework | React 18 + TypeScript | Strong typing for complex state; JSX for SVG composition |
| Bundler | Vite | Near-instant HMR; handles dynamic asset imports |
| In-browser solver | TypeScript (`mna.ts`) | Full DC MNA including controlled sources; primary engine |

---

## 4. C++ core library — `circuitcalc`

All C++ is inside the `circuitcalc` static library target. Headers live under
`include/circuitcalc/` and implementations under `src/`. The library has no
external dependencies beyond the C++ standard library.

---

### 4.1 Circuit element classes — `elements.hpp`

```
include/circuitcalc/circuit/elements.hpp
```

This file defines the inheritance hierarchy for circuit elements:

```
CircuitElement  (abstract base)
├── Resistor
├── CurrentSource
└── VoltageSource
```

**`CircuitElement`** is an abstract polymorphic base. It declares:

- `Kind` — a scoped enum with values `Resistor`, `CurrentSource`, `VoltageSource`.
- `virtual Kind kind() const noexcept = 0` — every derived class must say what
  kind of element it is.
- Copy constructor and copy assignment are `= delete` because elements are owned
  by the `ElementList` and must not be duplicated accidentally.
- The destructor is `virtual` so that deleting a `CircuitElement*` correctly
  destroys the derived object.

**`Resistor`** stores `node_a`, `node_b` (int), and `ohms` (double). Current
convention: current flows from `node_a` to `node_b` when `V(a) > V(b)`.

**`CurrentSource`** stores `node_from`, `node_to`, and `amperes`. Conventional
positive current flows *into* `node_to` from `node_from` through the source —
consistent with the standard independent current source stamp in MNA.

**`VoltageSource`** stores `node_plus`, `node_minus`, and `volts`. The `+`
terminal is `node_plus`; the maintained voltage is `volts = V(plus) − V(minus)`.

These classes are used by `ElementList` as a polymorphic container. The solver
itself works through the `Netlist` entry structs (see §4.3), not through these
classes directly; `ElementList` is the data structure layer that demonstrates
OOP design.

---

### 4.2 Hand-rolled linked list — `element_list.hpp / .cpp`

```
include/circuitcalc/circuit/element_list.hpp
src/circuit/element_list.cpp
```

`ElementList` is a singly linked list of `ElementNode` records, each holding a
raw pointer to a heap-allocated `CircuitElement`. The list **owns** every element
it holds.

**`ElementNode`** is a plain struct:
```cpp
struct ElementNode {
    CircuitElement* element;  // owned heap object
    ElementNode*    next;     // next node in chain (null = end)
};
```

**`ElementList`** public API:

| Method | Complexity | Description |
|---|---|---|
| `push_front(e*)` | O(1) | Prepend; takes ownership of `e` |
| `push_back(e*)` | O(1) | Append; kept O(1) with a `tail_` pointer |
| `pop_front()` | O(1) | Remove head; destroys the element |
| `clear()` | O(n) | Destroys all nodes and elements |
| `head() / tail()` | O(1) | Accessors |
| `size()` | O(1) | Element count |
| `empty()` | O(1) | True if size == 0 |

**Memory management**: the destructor calls `clear()`, which walks the list and
calls `delete` on both each `ElementNode` and its `element` pointer. No
`std::unique_ptr` is used — manual ownership is explicit to satisfy the
project's "hand-rolled data structures" requirement.

**Move semantics** are implemented so that the list can be moved efficiently
(e.g., returned from a function) without deep copying. The move constructor
transfers `head_`, `tail_`, and `size_` then nulls the source. Move assignment
uses the swap-and-let-the-old-one-die idiom.

**Why no copy semantics?** Deep-copying a polymorphic list would require a
virtual `clone()` method on `CircuitElement`. Keeping it move-only avoids that
complexity while still allowing the list to be stored in standard containers if
needed.

---

### 4.3 Netlist — `netlist.hpp / .cpp`

```
include/circuitcalc/netlist/netlist.hpp
src/netlist/netlist.cpp
```

The `Netlist` class is the primary input to the solver. Rather than traversing
the polymorphic `ElementList`, the solver works with three flat arrays of plain
structs — one per element type — for clarity and cache efficiency.

**Entry structs**:
```cpp
struct ResistorEntry     { int node_a, node_b; double ohms; };
struct CurrentSourceEntry{ int node_from, node_to; double amperes; };
struct VoltageSourceEntry{ int node_plus, node_minus; double volts; };
```

**Capacity limits** (compile-time constants on `Netlist`):
- `kMaxResistors` = 256
- `kMaxCurrentSources` = 128
- `kMaxVoltageSources` = 64

These are deliberately generous for any hand-built schematic. Exceeding them
throws a `circuit_error`.

**API**:
- `set_node_count(n)` — tells the netlist how many distinct nodes exist
  (including node 0 = ground).
- `add_resistor / add_current_source / add_voltage_source` — appends an entry
  to the relevant array. Bounds-checked.
- `resistor(i)`, `current_source(i)`, `voltage_source(i)` — const accessors.
- `clear()` — resets everything to empty.

**Node numbering**: node 0 is always ground (the reference). All other integers
are distinct circuit nodes. The solver uses the node count to size its linear
system.

---

### 4.4 Dense matrix — `matrix.hpp / .cpp`

```
include/circuitcalc/core/matrix.hpp
src/core/matrix.cpp
```

`Matrix` is a heap-allocated row-major dense matrix of `double`. It is used
exclusively for the MNA system matrix `A`.

```cpp
class Matrix {
    std::size_t rows_, cols_;
    double* data_;           // flat array, row-major
public:
    Matrix(std::size_t rows, std::size_t cols);
    ~Matrix();
    double& at(std::size_t r, std::size_t c);
    double  at(std::size_t r, std::size_t c) const;
    static void solve_gaussian(Matrix& a, double* b, std::size_t n);
};
```

The `at(r, c)` accessor computes `data_[r * cols_ + c]`. Copy semantics are
deleted; the matrix is single-owner. Destruction calls `delete[] data_`.

The class is intentionally minimal — no BLAS, no LAPACK, no Eigen — because the
circuits handled here are small (< 256 nodes) and the goal is to show the
algorithm rather than peak performance.

---

### 4.5 Gaussian elimination

```cpp
// src/core/matrix.cpp
void Matrix::solve_gaussian(Matrix& a, double* b, std::size_t n)
```

This static method solves the square linear system **A x = b** using
*partial pivoting Gaussian elimination*. The solution vector `x` is written
back into `b` in-place (i.e., `b` becomes `x` on return).

**Algorithm steps**:

1. **Forward elimination** — for each column `k` from 0 to n−1:
   a. *Partial pivot*: scan rows `k+1..n-1` for the row whose entry in column
      `k` has the largest absolute value. Swap it with row `k`. This improves
      numerical stability.
   b. *Singularity check*: if the pivot element is smaller than the tolerance
      `ε × 10⁶` (about `2.2 × 10⁻¹⁰`), the matrix is singular or
      ill-conditioned — throw `singular_matrix_error`.
   c. *Eliminate*: for each row `r > k`, subtract `(A[r,k] / A[k,k])` times
      row `k` from row `r`. After this, column `k` has zeros below the diagonal.

2. **Back substitution** — for each row `r` from `n-1` down to 0:
   `x[r] = (b[r] − Σ A[r,c]·x[c] for c > r) / A[r,r]`.

The tolerance `tol` uses `std::numeric_limits<double>::epsilon() * 1e6` to
accommodate accumulated floating-point rounding, with a floor of `1e-15`.

The TypeScript version (`lib/mna.ts`) uses a fixed tolerance of `1e-12` and
implements the identical algorithm on a flat `number[]` array.

---

### 4.6 DC solver — `dc_solver.hpp / .cpp`

```
include/circuitcalc/analysis/dc_solver.hpp
src/analysis/dc_solver.cpp
```

`DcSolver` is a stateless class with one public method:

```cpp
DcAnalysisResult DcSolver::solve(const Netlist& netlist) const;
```

It is stateless by design — you can call it from multiple threads or reuse the
same instance for many circuits without side effects.

**Pre-conditions checked before any allocation**:
- `n_nodes >= 1` — the netlist must have at least a ground node.
- `n_nodes <= kMaxNodes` (256) — to fit in the fixed-size result array.
- No voltage source with both terminals on ground — that is a degenerate circuit.
- All resistances must be strictly positive.

**Sizing the system**:
```
n_free = n_nodes − 1        (degrees of freedom; ground has no unknown)
n_vs   = number of voltage sources
dim    = n_free + n_vs      (total unknowns)
```

The extra `n_vs` unknowns are the currents through each voltage source — a
hallmark of MNA. (See §4.7 for why.)

**Memory**: a `dim × dim` `Matrix A` and a raw `double[dim]` vector `b` are
allocated on the heap. After the solve, `b` is destroyed with `delete[]`.
This avoids VLAs (which are not standard C++17) while keeping the code simple.

---

### 4.7 Modified Nodal Analysis (MNA) — the algorithm

MNA turns a circuit into a linear system **A x = b** where **x** contains all
unknown node voltages (except ground) and all voltage source currents.

#### Resistor stamp

For a resistor with conductance `g = 1/R` between nodes `a` and `b`:

```
A[ua, ua] += g
A[ub, ub] += g
A[ua, ub] -= g   (if both non-ground)
A[ub, ua] -= g
```

where `ua = a − 1` (the MNA index; ground maps to −1 and is skipped).

This comes directly from Kirchhoff's Current Law: the current flowing out of
node `a` due to this resistor is `g × (V_a − V_b)`. Summing over all resistors
at node `a` gives row `ua` of the conductance matrix.

#### Current source stamp

For a current source delivering `I` amperes from `node_from` to `node_to`:

```
b[u_from] -= I
b[u_to]   += I
```

Current sources inject/absorb current directly into the RHS vector — they do
not appear in the matrix.

#### Voltage source stamp (the MNA extension)

A voltage source cannot be stamped like a resistor because its terminal voltage
is fixed (not determined by KCL). Instead, MNA introduces an extra unknown
`i_k` for the current through the k-th voltage source, placed at index
`n_free + k` in the solution vector.

For voltage source `k` holding `V(plus) − V(minus) = Vs`:

```
A[u_plus,  n_free+k] += 1
A[n_free+k, u_plus]  += 1
A[u_minus, n_free+k] -= 1
A[n_free+k, u_minus] -= 1
b[n_free+k]           = Vs
```

The upper-left block of `A` is the conductance matrix `G`. The coupling of the
voltage source into this block via `±1` entries enforces the KVL constraint
`V_plus − V_minus = Vs`. Row `n_free+k` of the augmented system is that KVL
equation.

#### Solution extraction

After `solve_gaussian` writes the solution back into `b`:

- `node_voltage[i] = b[i − 1]` for `i = 1..n_nodes−1`; `node_voltage[0] = 0`.
- `resistor_current[ri] = (V_a − V_b) / R` for each resistor.
- `current_source_current[ci]` = declared value (the source current is an input,
  not an unknown).
- `voltage_source_current[k] = b[n_free + k]` — the augmented unknown read
  directly from the solution vector.

---

### 4.8 Analysis result — `analysis_result.hpp`

```
include/circuitcalc/analysis/analysis_result.hpp
```

```cpp
struct DcAnalysisResult {
    static constexpr std::size_t kMaxNodes = 256;

    std::size_t num_nodes;
    double node_voltage[kMaxNodes];

    int num_resistors;
    double resistor_current[Netlist::kMaxResistors];

    int num_current_sources;
    double current_source_current[Netlist::kMaxCurrentSources];

    int num_voltage_sources;
    double voltage_source_current[Netlist::kMaxVoltageSources];
};
```

This is a plain struct with no dynamic allocation — it can be returned by value
efficiently with NRVO/RVO. The fixed-size arrays avoid any heap usage in the
result.

**Sign conventions** (documented in the header):

- `node_voltage[i]` — potential at node `i` relative to ground. Node 0 is always 0.
- `resistor_current[k]` — current flowing from `node_a` to `node_b` of the
  k-th resistor. Positive when `V(a) > V(b)`.
- `current_source_current[k]` — equal to the declared value (flows into
  `node_to` from `node_from`).
- `voltage_source_current[k]` — SPICE convention: positive means current entering
  the `+` terminal *from the external circuit*. A source supplying power
  reports a **negative** value because conventional current flows out of its `+`
  terminal into the external network.

---

### 4.9 JSON I/O — `json_io.hpp / .cpp`

```
include/circuitcalc/io/json_io.hpp
src/io/json_io.cpp
```

This layer provides the JSON contract between the C++ solver and the JavaScript
caller (or CLI). No external JSON library is used — everything is hand-rolled.

#### Input schema

```json
{
  "node_count": 3,
  "branches": [
    { "type": "V", "n1": 1, "n2": 0, "value": 10.0 },
    { "type": "R", "n1": 1, "n2": 2, "value": 1000.0 },
    { "type": "R", "n1": 2, "n2": 0, "value": 1000.0 }
  ]
}
```

- `node_count` — total nodes including ground (node 0).
- `branches` — ordered list; the output `branch_currents` array mirrors this order.
- `type` — `"R"` resistor, `"V"` voltage source, `"I"` current source.
- `n1`, `n2` — node indices (0 = ground).
- `value` — ohms / volts / amperes depending on type.

#### Output schema

```json
{ "ok": true, "node_voltages": [0, 5, 10], "branch_currents": [-0.005, 0.005] }
```
or on error:
```json
{ "ok": false, "error": "matrix is singular or ill-conditioned" }
```

#### Parser implementation

`parse_netlist_json` is a **recursive-descent parser** written with a single
integer cursor `i` into the raw `const char*`. Key helpers:

- `skip_ws` — advances past whitespace.
- `expect_char` — consumes a specific character or throws `circuit_error`.
- `parse_string` — reads a `"..."` value, handling `\"` and `\\` escapes.
- `parse_number` — reads a JSON number (integer, float, scientific notation)
  into a 64-byte stack buffer, then calls `std::strtod`.
- `skip_value` — recursively skips any JSON value (used for unknown keys so the
  parser does not break if extra fields appear).

The parser accepts unknown top-level keys and unknown branch keys gracefully,
making it forward-compatible with schema additions.

#### Serialisation

`result_to_json` builds the output string by appending to a `std::string` with
`reserve(512)` to avoid repeated reallocations. It uses `dbl_to_str` which
calls `std::snprintf` with `"%.10g"` — ten significant digits, trailing zeros
suppressed, scientific notation when needed.

`error_to_json` escapes `"` and `\` in the message to produce a valid JSON
string value.

#### `ParsedCircuit`

This struct pairs a `Netlist` (ready for the solver) with a `branch_types`
character array (`'R'`, `'V'`, `'I'`). The branch types are needed by
`result_to_json` to index into the right per-type current arrays in the
`DcAnalysisResult` when producing the unified `branch_currents` output.

---

### 4.10 Error types — `errors.hpp`

```
include/circuitcalc/core/errors.hpp
```

Two exception types:

- `circuit_error` — thrown for user-facing problems such as a floating node,
  negative resistance, or malformed JSON.
- `singular_matrix_error` — thrown by `solve_gaussian` when the pivot is too
  small; typically indicates a topological problem (floating net, short circuit).

Both derive from `std::runtime_error`, so a single `catch (const std::exception&)`
at the WASM boundary handles all library exceptions.

---

## 5. Build system — `CMakeLists.txt`

The CMakeLists has two logical halves:

### Native (default) build

```cmake
add_library(circuitcalc STATIC
    src/circuit/element_list.cpp
    src/core/matrix.cpp
    src/netlist/netlist.cpp
    src/analysis/dc_solver.cpp
    src/io/json_io.cpp
)
target_include_directories(circuitcalc PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_compile_features(circuitcalc PUBLIC cxx_std_17)
```

All five implementation files are compiled into a single static library.
Warning flags are set differently per compiler (`/W4 /permissive-` for MSVC,
`-Wall -Wextra -Wpedantic` for GCC/Clang).

The CLI executable:
```cmake
add_executable(circuitcalc_cli apps/cli/main.cpp)
target_link_libraries(circuitcalc_cli PRIVATE circuitcalc)
```

### WASM build

Triggered by `-DCIRCUITCALC_BUILD_WASM=ON` when using `emcmake`:

```cmake
if(CIRCUITCALC_BUILD_WASM)
    if(NOT EMSCRIPTEN)
        message(FATAL_ERROR "...")
    endif()
    add_executable(circuitcalc_wasm apps/wasm/wasm_api.cpp)
    target_link_libraries(circuitcalc_wasm PRIVATE circuitcalc)
    set_target_properties(circuitcalc_wasm PROPERTIES SUFFIX ".js")
    target_link_options(circuitcalc_wasm PRIVATE
        "--bind"
        "-sMODULARIZE=1"
        "-sEXPORT_NAME=createCircuitCalc"
        "-sENVIRONMENT=web"
        "-sALLOW_MEMORY_GROWTH=1"
        "-O2"
    )
endif()
```

Key Emscripten flags:
- `--bind` — enables the Embind C++ ↔ JavaScript binding system.
- `-sMODULARIZE=1` — wraps the WASM module in a factory function rather than
  executing on load, preventing global pollution.
- `-sEXPORT_NAME=createCircuitCalc` — the factory function is assigned to
  `window.createCircuitCalc` when loaded via a `<script>` tag.
- `-sENVIRONMENT=web` — strips out Node.js file I/O stubs, reducing binary size.
- `-sALLOW_MEMORY_GROWTH=1` — the WASM heap can grow dynamically if a very
  large circuit is presented. Needed because initial heap size is small.
- `-O2` — optimise for speed without debug symbols.

The build produces two files:
- `circuitcalc_wasm.js` (~27 KB) — the JavaScript glue loader
- `circuitcalc_wasm.wasm` (~51 KB) — the compiled binary

Both are copied to `web/public/wasm/` so Vite serves them as static assets.

---

## 6. CLI application — `apps/cli/main.cpp`

The CLI is a standalone golden test suite, not a REPL. It proves the solver
works correctly with known hand-calculated circuits before the WASM bridge is
involved.

Three tests are implemented:

**Test 1 — Voltage divider**

```
10V source → node 1 → R1 (1 kΩ) → node 2 → R2 (1 kΩ) → ground
```
Expected: V(1) = 10 V, V(2) = 5 V, all currents = 5 mA.
The voltage source current is −5 mA (SPICE sign: it is supplying power).

**Test 2 — Current source with parallel resistors**

```
2 mA source from ground into node 1; R1 = R2 = 1 kΩ from node 1 to ground
```
Equivalent resistance = 500 Ω, so V(1) = 1 V. Each resistor carries 1 mA.

**Test 3 — Two voltage sources through a resistor**

```
Vs1 = 10 V (node 1 to GND), Vs2 = 4 V (node 2 to GND), R = 2 kΩ (node 1 to node 2)
```
Expected: V(1) = 10 V, V(2) = 4 V, I(R) = 3 mA.
Vs1 supplies (−3 mA), Vs2 absorbs (+3 mA) — SPICE sign convention.

`print_result_as_json` prints a JSON-like representation of every result field.
`check` compares expected to actual with a tolerance of `1e-9` and prints
`OK` or `FAIL`.

The CLI returns exit code 0 on all pass, 1 on any failure — making it usable in
CI pipelines.

---

## 7. WebAssembly bridge — `apps/wasm/wasm_api.cpp`

```cpp
#include "circuitcalc/analysis/dc_solver.hpp"
#include "circuitcalc/io/json_io.hpp"
#include <emscripten/bind.h>
#include <string>

static std::string solve_circuit(const std::string& json_in) {
    try {
        const ParsedCircuit parsed = parse_netlist_json(json_in.c_str());
        const DcSolver solver;
        const DcAnalysisResult result = solver.solve(parsed.netlist);
        return result_to_json(result, parsed);
    } catch (const std::exception& e) {
        return error_to_json(e.what());
    } catch (...) {
        return error_to_json("unknown error");
    }
}

EMSCRIPTEN_BINDINGS(circuitcalc) {
    emscripten::function("solve_circuit", &solve_circuit);
}
```

This is the single entry point exposed to JavaScript. The entire pipeline —
parse JSON → build netlist → solve → serialise result — happens in one call.

**Error handling**: all exceptions are caught and converted to a JSON error
response. The `catch (...)` catches non-standard exceptions (e.g., from
third-party code). The JavaScript side never sees a C++ exception; it always
receives a valid JSON string.

**String ownership**: Emscripten's Embind handles the UTF-8 marshalling of
`std::string` in both directions. When JavaScript calls `solve_circuit(jsonStr)`,
Embind copies the JS string into C++ heap memory, the function runs, and the
return value is copied back to a JavaScript string. No manual memory management
is needed at the binding layer.

---

## 8. Emscripten build pipeline

The WASM module must be compiled separately from the native build. Full steps:

```powershell
# 1. Clone and install emsdk
git clone https://github.com/emscripten-core/emsdk.git D:\emsdk
cd D:\emsdk
python emsdk.py install latest
python emsdk.py activate latest

# 2. Set environment (current session only)
$env:PATH = "D:\emsdk;D:\emsdk\upstream\emscripten;" + $env:PATH
$env:EMSDK = "D:/emsdk"

# 3. Configure with emcmake (uses Emscripten toolchain automatically)
emcmake cmake -S . -B build-wasm -DCIRCUITCALC_BUILD_WASM=ON -DCIRCUITCALC_BUILD_CLI=OFF

# 4. Build
cmake --build build-wasm

# 5. Deploy to web
Copy-Item build-wasm/circuitcalc_wasm.js  web/public/wasm/
Copy-Item build-wasm/circuitcalc_wasm.wasm web/public/wasm/
```

`emcmake cmake` injects `-DCMAKE_TOOLCHAIN_FILE=<emsdk>/Emscripten.cmake` which
makes CMake target the Emscripten compiler (`emcc`) instead of the host compiler.
The `EMSCRIPTEN` CMake variable is defined, enabling the `if(CIRCUITCALC_BUILD_WASM)`
block. The rest of the CMake file runs identically to the native build.

---

## 9. TypeScript / React frontend — `web/`

The frontend is a Vite + React + TypeScript single-page application. The entry
point is `web/index.html`, which loads `web/src/main.tsx`.

---

### 9.1 Entry point — `main.tsx` and `index.html`

`index.html` has a single `<div id="root">` and one `<script type="module">`
tag pointing to `main.tsx`. Vite resolves the module graph from there.

`main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

`React.StrictMode` double-invokes effect callbacks during development to help
catch side-effect bugs. It has no effect in production.

---

### 9.2 Root component — `App.tsx`

`App.tsx` is the central state machine (product title: **Mr Goose Circuit Calculator**). It owns:

| State variable | Type | Description |
|---|---|---|
| `schematic` | `Schematic` | Components, wires, labels, ground, optional **Port A / Port B** for Thévenin |
| `pendingType` | `ToolType \| null` | Palette tool (includes `L`, `PA`, `PB`, probes, etc.) |
| `result` | `SolveResult \| null` | Last solver output |
| `solving` | `boolean` | True while async solve is in flight |
| `solveError` | `string \| null` | Netlist or solver errors |
| `netlistBranches` | `Branch[]` | Branch list from last conversion (results + visualization) |
| `animateMode` | `boolean` | Voltage colouring + current-flow overlay on wires |
| `pinToNode` | `Map<string,number> \| null` | `gk(pin)` → node id for canvas overlays |
| `nodeVoltages` | `number[] \| null` | Indexed by node id |
| `circuitInput` | `CircuitInput \| null` | Last netlist passed to **solution steps** |
| `theveninResult` | `TheveninResult \| null` | Computed when both ports are placed and solve succeeds |

**`handleSchematicChange`** resets stale solve results, overlays, visualization, Thévenin, and circuit-input cache whenever the schematic edits.

**`handleSolve`** runs `schematicToNetlistWithNodeMap` → `solve(netlist)` → on success stores overlays; if **Port A** and **Port B** are set on the schematic, runs **`computeThevenin`** (short-circuit current + fallback test source for \(R_\mathrm{th}\)).

The layout is a CSS Grid: palette (158 px) \| canvas \| results (300 px); narrow viewports stack columns.

---

### 9.3 Shared circuit types — `types/circuit.ts`

This file defines the **JSON contract** shared between:
- The TypeScript solver (`lib/mna.ts`)
- The WASM caller (`lib/solver.ts`)
- The netlist converter (`editor/toNetlist.ts`)
- The results display (`components/ResultsPanel.tsx`)

Core shapes (abbreviated):

```typescript
export interface CircuitInput {
  node_count: number;
  branches: Branch[];
}

export interface Branch {
  type: BranchType;          // 'R' | 'V' | 'I' | 'G' | 'E' | 'F' | 'H'
  n1: number; n2: number;
  value: number;
  nc1?: number; nc2?: number;      // control nodes (G / E)
  vs_ctrl_idx?: number;             // CCCS / CCVS → controlling VS row
  displayType?: DisplayBranchType;  // UI e.g. probe as 'A'
}

export type SolveResult =
  | { ok: true;  node_voltages: number[]; branch_currents: number[] }
  | { ok: false; error: string };
```

The discriminated union `SolveResult` forces callers to handle success and failure.

`BRANCH_LABELS` drives labels and units in **ResultsPanel**. Dependent-source metadata is documented in `editor/types.ts` (`varName` / `controlVar` on placed components).

---

### 9.4 Solver gateway — `lib/solver.ts`

`export async function solve(input)` dispatches to the active backend. **Today,
`tryLoadWasm()` returns `null` immediately** (and logs that WASM is disabled):
the shipped Emscripten binary predates the extended JSON netlist (dependent
sources, `vs_ctrl_idx`, etc.) and aborts if loaded. **All production solves use**
`solveCircuit` from **`lib/mna.ts`**.

To restore WASM after rebuilding `circuitcalc_wasm` with the current JSON I/O:

1. Place `circuitcalc_wasm.js` + `.wasm` under `web/public/wasm/`.
2. Re-implement `tryLoadWasm()` to load the script / instantiate the module.
3. Verify parity on a circuit with G/E/F/H branches.

Until then, the TypeScript path is the single source of truth in the browser.

---

### 9.5 TypeScript MNA — `lib/mna.ts`

This module implements **full DC MNA** for the branch types the UI emits (including
VCCS, VCVS, CCCS, CCVS, and current probes as 0 V sources). It is **not** a legacy
fallback — it is the engine users run. Compared to the original C++ resistive
solver, it extends stamping and unknown counting for controlled sources. Differences
vs the C++ core implementation:

| C++ | TypeScript |
|---|---|
| `double A[dim*dim]` (heap, `new`) | `new Array<number>(dim * dim).fill(0)` |
| `double b[dim]` (heap) | `new Array<number>(dim).fill(0)` |
| `Matrix::at(r,c)` | `A[r * dim + c]` (inline) |
| Throws `circuit_error` | Returns `{ ok: false, error: message }` |
| Throws `singular_matrix_error` | Throws `Error` (caught by outer try/catch) |

The `gaussianElim` function takes a flat row-major `number[]` for `A` and a
`number[]` for `b`, same structure as `Matrix::data_` in C++.

`unkIdx(node)` mirrors `unknown_index(node)` in `dc_solver.cpp`: returns
`node - 1` for non-ground nodes, `-1` for ground.

---

### 9.6 Solution steps — `lib/solutionSteps.ts`

After a successful solve, **`generateSolutionSteps`** builds a list of **`SolutionSection`**
blocks (circuit inventory, “method used”, per-node KCL-style explanations, solved
voltages, branch currents, optional power balance). **`ResultsPanel`** renders them as
collapsible panels when `circuitInput` is passed from **`App.tsx`**. This layer is purely
presentational — it consumes the solved voltages/currents **retrospectively** and does not
duplicate the Gaussian elimination numerically except for arithmetic checks like KCL sums.

---

## 10. Schematic editor subsystem — `editor/`

The editor subsystem converts mouse gestures on an SVG canvas into a `Schematic`
data structure, and separately converts that structure into a solver `CircuitInput`.
These two concerns are cleanly separated into multiple files.

---

### 10.1 Constants — `constants.ts`

```typescript
export const GRID       = 40;    // pixels per grid unit
export const COMP_UNITS = 2;     // each component spans 2 grid units (80 px)
export const COMP_PX    = 80;    // COMP_UNITS * GRID
export const CANVAS_COLS = 20;
export const CANVAS_ROWS = 14;
export const CANVAS_W    = 800;
export const CANVAS_H    = 560;
export const PIN_R       = 5;    // pin circle radius in px

export const NODE_COLORS = [
  '#16a34a',  // 0 — GND (green)
  '#2563eb',  // 1 (blue)
  '#ea580c',  // 2 (orange)
  '#9333ea',  // 3 (purple)
  '#db2777',  // 4 (pink)
  '#0891b2',  // 5 (teal)
  '#ca8a04',  // 6 (amber)
  '#64748b',  // 7 (slate)
];
```

The grid is 20 × 14 cells, each 40 px, giving a canvas of 800 × 560 px. All
component and wire positions are stored as integer grid coordinates and converted
to pixel coordinates only during rendering via `toScreen`.

`NODE_COLORS` cycles through 8 colours. Node 0 (ground) is always green to
match the ground symbol colour. The same palette is used in `EditorCanvas` for
ring overlays and in `ResultsPanel` for the colour-coded node table.

---

### 10.2 Types — `editor/types.ts`

Defines **palette / canvas** structure (solver JSON types live in **`types/circuit.ts`**).

```typescript
export type SolverBranchType = 'R' | 'V' | 'I' | 'G' | 'E' | 'F' | 'H';
export type ComponentType = SolverBranchType | 'OC' | 'A';  // OC open, A probe
export type ToolType = ComponentType | 'L' | 'PA' | 'PB';     // labels + Thévenin ports

export interface PlacedComponent {
  id: string;
  type: ComponentType;
  value: number;
  pin1: GridPoint;
  rotation: 0 | 90 | 180 | 270;
  varName?: string;       // measured quantity name for others to reference
  controlVar?: string;    // for G/E/F/H — references a varName
}

export interface Schematic {
  components: PlacedComponent[];
  wires: Wire[];
  labels: WireLabel[];
  groundPoint: GridPoint | null;
  portA: GridPoint | null;     // Thévenin/Norton terminal a
  portB: GridPoint | null;      // terminal b
}
```

**`PlacedComponent.id`** uses `crypto.randomUUID()` (not a module-level counter)
to avoid ID collisions when Vite's Hot Module Replacement resets module scope
while React state from the previous module version persists.

**`rotation`** encodes the angle at which pin2 is offset from pin1:
- 0°: pin2 = pin1 + (2, 0) — horizontal, rightward
- 90°: pin2 = pin1 + (0, 2) — vertical, downward
- 180°: pin2 = pin1 + (−2, 0) — horizontal, leftward
- 270°: pin2 = pin1 + (0, −2) — vertical, upward

**`groundPoint`** is any grid point designated as the reference node. If null,
`toNetlist.ts` auto-assigns the first component's pin1 as ground and logs a
warning.

---

### 10.3 Utilities — `utils.ts`

```typescript
export function getPin2(c: PlacedComponent): GridPoint
export function toScreen(p: GridPoint): { x: number; y: number }
export function snapToGrid(screenX: number, screenY: number): GridPoint
export function gridEq(a: GridPoint | null, b: GridPoint | null): boolean
export function gk(p: GridPoint): string          // canonical key "x,y"
export function formatValue(value: number, type: ComponentType, controlVar?: string): string
```

**`getPin2`** uses a `switch` on `rotation` to compute the second pin's grid
position. This is the single source of truth for component geometry — both the
canvas renderer and the netlist converter use it.

**`gk`** (grid key) converts a `GridPoint` to a canonical string `"x,y"`. This
string is used as keys in `Map<string, ...>` throughout the system — in the
Union-Find, in `pinToNode`, and in `hoveredPinKey`. Integer coordinates
guarantee no floating-point collision issues.

**`formatValue`** formats a numeric component value with SI prefixes (k, m, µ)
and the appropriate unit symbol (Ω, V, A). Used for component labels on the
canvas.

---

### 10.4 Component shapes — `ComponentShape.tsx`

Each component type is drawn as a group of SVG primitives in a **local
coordinate system**: pin1 is at (0, 0) and pin2 is at (80, 0) (horizontal
layout). The parent `<g>` applies `translate(s1.x, s1.y) rotate(rotation)`
to position and orient the shape on the canvas.

**`ResistorShape`**: American standard zigzag.
```
lead (0→20) — zigzag (20→60) — lead (60→80)
```
The zigzag uses a `<polyline>` with 7 points alternating ±11 px vertically.

**`VoltageSourceShape`**: circle centred at (40, 0) with radius 17. The `+`
symbol appears on the left (pin1 / positive terminal) drawn as two perpendicular
lines; the `−` appears on the right.

**`CurrentSourceShape`**: circle centred at (40, 0) with a horizontal arrow
pointing from left (pin1) to right (pin2). The arrow is a shaft line plus a
filled `<polygon>` triangle at the tip.

**`GroundSymbol`**: centred at (0, 0), hangs downward. Three horizontal lines of
decreasing width (26 px, 16 px, 6 px) create the classic IEEE ground symbol.

All strokes use `stroke="currentColor"` so the parent `<g style="color: ...">` can
change the colour for selection states without duplicating the shape code.

---

### 10.5 Palette sidebar — `Palette.tsx`

Grouped buttons (Independent / Dependent / Utility / Analysis) plus a static shortcut list.
`ToolType` covers branch devices, wire labels (`L`), and Thévenin ports (`PA`, `PB`).

Props:
```typescript
interface Props {
  selected: ToolType | null;
  onSelect: (t: ToolType | null) => void;
}
```

Toggle behaviour: clicking the active tool again clears selection.

The shortcut list is static. It documents the current interaction model:
click palette → place, Shift+click → keep placing, R → cycle rotation
(0→90→180→270→0), click pin → start wire, right-click pin → set GND,
click wire → delete, Del → delete selected, Esc → cancel.

---

### 10.6 Netlist converter — `toNetlist.ts`

This is the most algorithmically complex TypeScript file. It converts a visual
`Schematic` (a graph of components, wires, and positions) into a solver-ready
`CircuitInput` (a list of branches with integer node indices).

#### Union-Find

A weighted Union-Find with path compression is implemented inline:

```typescript
function makeUF() {
  const parent = new Map<string, string>();
  const rank   = new Map<string, number>();

  function find(k: string): string { ... }   // path-compressed
  function union(a: string, b: string) { ... } // rank-based

  return { find, union };
}
```

Keys are grid-point strings from `gk()`. Each connected component of the
electrical graph (wires + connections) becomes one equivalence class in the UF.

#### Algorithm

1. **Seed** — every component pin and every wire endpoint is seeded into the UF
   (calling `uf.find(key)` creates the node if absent).

2. **Wire-endpoint union** — for each wire `w`, call `uf.union(gk(w.from), gk(w.to))`.
   After this step, all pins connected by a chain of wires share a UF root.

3. **Wire-on-wire T-junctions** — if a wire endpoint lies *strictly inside*
   another wire segment (not at its endpoints), union them. This handles the case
   where a vertical wire meets a horizontal wire mid-segment.

4. **Component-pin T-junctions** — if a pin lies strictly **inside** a wire segment
   (not at that wire's endpoints), `union(pin, wire.from)` attaches the device to the
   backbone net. **Guard:** unions are skipped only when **both pins of this device**
   already map to the **same** UF root *before* these merges (already one electrical
   node — redundant/degenerate). An older heuristic skipped when *any* root overlapped
   between the two pins’ attachment sets — that falsely treated two pins on the same
   **long wire** as a “short” and **disconnected** them from the sketch (wrong colours,
   bogus nodes). That logic was removed.

5. **Node numbering** — the UF root of the ground point (or fallback) is assigned
   node ID 0. All other roots are assigned sequential integers 1, 2, 3, ...

6. **Branch generation** — for each component, look up `nodeOf(pin1)` and
   `nodeOf(pin2)` and produce a `Branch` object. If a pin has no entry in the
   node map, throw an error asking the user to connect all pins.

7. **`pinToNode` map** — after numbering, build a `Map<string, number>` covering
   every component pin and wire endpoint. This map is returned alongside the
   netlist and passed to the canvas for node overlay rendering.

#### `onSegment` helper

```typescript
function onSegment(a, b, pt): boolean {
  // Cross-product zero ⟹ collinear
  if ((b.x - a.x) * (pt.y - a.y) !== (b.y - a.y) * (pt.x - a.x)) return false;
  // Within bounding box
  return pt.x >= Math.min(a.x, b.x) && pt.x <= Math.max(a.x, b.x)
      && pt.y >= Math.min(a.y, b.y) && pt.y <= Math.max(a.y, b.y);
}
```

Uses integer arithmetic exclusively (no floating-point) so collinearity checks
are exact on the integer grid.

---

### 10.7 Editor canvas — `EditorCanvas.tsx`

This is the largest and most stateful file in the project. It renders the SVG
canvas and handles all user interactions.

#### Internal state

| State variable | Type | Description |
|---|---|---|
| `mouseGrid` | `GridPoint \| null` | Current cursor position snapped to grid |
| `wiringFrom` | `GridPoint \| null` | Anchor point when drawing a wire |
| `selectedId` | `string \| null` | ID of the currently selected component |
| `editingId` | `string \| null` | ID of the component whose value editor is open |
| `pendingRot` | `0\|90\|180\|270` | Rotation for the next component to be placed |
| `dragState` | `DragState \| null` | Active drag operation |
| `hoveredPinKey` | `string \| null` | `gk` of the pin currently under the cursor |

**`DragState`**:
```typescript
interface DragState {
  id:             string;
  startMouseGrid: GridPoint;
  startPin1:      GridPoint;
  dragging:       boolean;
}
```

`dragging` is false until the mouse moves to a different grid cell than
`startMouseGrid`, allowing the system to distinguish a click (no drag) from a
drag (moved at least one grid unit).

#### Interaction model

**Placing a component**:
When `pendingType` is non-null, `handleBgClick` places a new component at the
snapped cursor position. The component's `pin1` is the click point and its
`rotation` is `pendingRot`. Bounds checking ensures both pins remain within
`CANVAS_COLS × CANVAS_ROWS`. Shift+click keeps the placement mode active.

**Drawing a wire**:
When the user clicks a pin circle (component pin or wire junction dot),
`handlePinClick` is called. If `wiringFrom` is null, it sets `wiringFrom` to
that pin. If `wiringFrom` is non-null, it creates a new `Wire` and clears
`wiringFrom`. A dashed blue preview line tracks the cursor while wiring.

**Selecting a component**:
`handleComponentMouseDown` records a `DragState` with `dragging: false`. The
global `mouseup` handler (in a `useEffect`) resolves the gesture:
- If the mouse never moved: **click** → toggle selection (first click selects,
  second click on already-selected opens the value editor).
- If the mouse moved: **drag** → commit the move.

This design cleanly separates selection, editing, and dragging without nested
state machines.

**Moving a component**:
`getDragPreviewPin1` computes the new pin1 position as:
```
newPin1 = startPin1 + (currentMouse - startMouse)
```
During the drag, the component renders at this preview position. Connected wires
also update their endpoints in real time via `visualWireEnd`. On `mouseup`,
`commitDrag` calls `onChange` with the permanently moved schematic.

The global `mouseup` listener is added only while `dragState` is non-null
(the `useEffect` dependency is `!!dragState`) to minimise overhead.

**Deleting a wire**:
Left-click on a wire body calls `handleWireClick`. If `wiringFrom` is active,
the click falls through to the background (not consumed) so the wire endpoint
is the landing point. If not wiring, the wire is deleted immediately.

**Wire junction dots**:
Before rendering, `wireNodeMap` is computed: all unique wire endpoints whose
grid key does not match any component pin. These positions get their own
`<circle>` elements with `onClick → handlePinClick` and `onContextMenu →
handlePinRightClick` — identical to component pin circles. This makes every
wire endpoint a valid wiring start/end point.

**Node overlays**:
When `nodeHighlights` and `nodeVoltages` props are both non-null (after a
successful solve), two overlay passes run:
1. A coloured ring (`r = 9`, `fillOpacity = 0.12`) appears around every
   component pin and wire junction node, using the colour from `NODE_COLORS[nodeId]`.
2. When `hoveredPinKey` matches a pin, a floating badge renders above the ring
   showing `N{id} · {voltage}` in the same node colour.

**Keyboard shortcuts**:
The `useEffect` keyboard handler checks `e.target.tagName` before processing
`Delete` / `Backspace` — if the target is an `INPUT` or `TEXTAREA`, the event
is ignored (so backspacing in the value editor doesn't delete the component).
`R` cycles `pendingRot` or the selected component's rotation. `Enter` opens the
value editor for the selected component. `Escape` dismisses editor → clears
selection → cancels placement/wiring in order.

**SVG rendering order**:
1. Grid dot pattern (`<rect fill="url(#dot-grid)">`)
2. Background click target (`<rect fill="transparent">`)
3. Wire lines
4. Wire junction dots (before components so pins appear on top)
5. Wire preview
6. Ground symbol
7. Component bodies + labels + pin circles
8. Node rings + hover badges (topmost, so they overlay everything)
9. Placement ghost

---

## 11. Results panel — `components/ResultsPanel.tsx`

Presentational panel for **node voltages**, **branch currents**, optional **solution steps**
(`circuitInput` + `generateSolutionSteps`), and optional **Thévenin/Norton**
(`thevenin` prop: \(V_\mathrm{th}\), \(I_\mathrm{N}\), \(R_\mathrm{th}\), small diagrams).

Formatting uses SI-style prefixes. Control / probe nodes (`nc1`/`nc2`) appear for dependent
sources. When `result` is null, a short empty state appears; errors from netlist conversion
surface in **`App.tsx`** above the panel.

---

## 12. Styling — `index.css`

The stylesheet uses CSS custom properties (variables) for the entire colour
palette, making theme changes straightforward.

**Waterloo gold theme**:
```css
--accent:      #FFD100;   /* University of Waterloo gold */
--accent-dark: #E8BE00;   /* hover / pressed state */
--accent-fg:   #1a1a1a;   /* text ON a gold background */
--accent-link: #8B6F00;   /* gold-toned links on white */
```

The header, solve button, active palette items, and focus rings all use the gold
palette. Text on gold backgrounds uses `--accent-fg` (near black) for contrast.

**Canvas SVG colours** that cannot use CSS variables (SVG attributes do not
inherit from CSS custom properties) are defined as TypeScript constants in
`EditorCanvas.tsx`:
```typescript
const SEL_COLOR  = '#B8860B';  // dark goldenrod — selected component
const WIRE_COLOR = '#B8860B';  // wiring-mode indicator
```

**Layout**: the main grid is defined as:
```css
.app-main-editor {
  display: grid;
  grid-template-columns: 158px 1fr 300px;
}
```

The centre column (`1fr`) is flexible; the palette and results panel are fixed
width. On screens narrower than 1000 px, the columns stack vertically.

**Selection hint bar** (`selection-hint`): a subtle warm-yellow strip that
appears below the canvas when a component is selected but the value editor is
not open. It reminds the user of available keyboard actions without occupying
permanent screen space.

---

## 13. End-to-end data flow

Here is the sequence from gesture to displayed result (**current shipping path**):

```
User clicks Solve in App.tsx
  │
  ▼
schematicToNetlistWithNodeMap(schematic)              [toNetlist.ts]
  ├── Union–Find: pins, wires, wire–wire & component T-junctions,
  │   net labels (short-circuit guard only when both device pins already share a node)
  ├── assign integer nodes (reference ground → 0)
  └── { netlist, pinToNode }
  │
  ▼
solve(netlist) → solveCircuit(netlist)                [lib/solver.ts → lib/mna.ts]
  └── Gaussian elimination → SolveResult
      (WASM intentionally disabled until binary matches JSON schema)
  │
  ▼
App.tsx stores result + pinToNode + node_voltages (+ circuitInput for steps,
  + computeThevenin if ports A/B placed)
  │
  ▼
React re-render
  ├── EditorCanvas — node rings, optional Visualize overlay
  └── ResultsPanel — tables, steps, Thévenin/Norton block
```

---

## 14. Sign conventions used throughout

Consistent sign conventions are critical for the numbers to make physical sense.

| Quantity | Convention | Notes |
|---|---|---|
| Node voltage | V(n) = potential at node n relative to node 0 | Node 0 is always 0 V |
| Resistor current | `I = (V(n1) − V(n2)) / R`, flowing n1 → n2 | Positive when n1 is higher potential |
| Current source current | Equal to declared amperes value | Flows *into* `n2` from `n1` through the source body |
| Voltage source current | SPICE convention: positive = current entering `+` from external circuit | A source **supplying** power has **negative** current |

The SPICE convention for voltage sources is counterintuitive at first. It means
that a 10 V source powering a 1 kΩ load will show `I = −0.01 A` in the
results. The comment in `analysis_result.hpp` explains this, and the CLI test
confirms it: `I(Vs) = -5 mA (supplying)`.

Both the C++ and TypeScript solvers adhere to these conventions identically.
The results panel displays raw values from the solver without sign inversion.

---

## 15. Known constraints and limits

| Constraint | Value | Location |
|---|---|---|
| Max circuit nodes | 256 | `DcAnalysisResult::kMaxNodes` (C++ limits) |
| Canvas grid | 20 × 14 cells | `constants.ts` |
| **Browser solver branch types** | R, V, I, G, E, F, H (+ display `A`) | `types/circuit.ts`, `toNetlist.ts`, `mna.ts` |
| Rotation steps | 0°, 90°, 180°, 270° | `PlacedComponent.rotation` |

The **TypeScript** solver does not use the C++ fixed array caps for normal operation;
the **C++ / WASM** JSON parser still enforces its own maximum branch counts when WASM is used.

**Non-linear elements** (diodes, transistors, capacitors, inductors) are not
supported. The MNA formulation is DC only. Adding AC analysis would require
complex-number arithmetic and impedance stamping.

**Diagonal wires**: the grid enforces orthogonal wiring. The `Wire` type
technically allows arbitrary endpoints, but the UI only snaps to integer grid
points, so diagonal wires can only appear if programmatically constructed.

**Singular / ill-posed circuits**: `mna.ts` errors on a singular matrix (floating nets,
ideal contradictions). **`toNetlist.ts`** rejects **zero-length branches** (both pins of a
component on the same net) with an explicit message.

**Diagonal components**: pins lie on integer grid cells; wires are orthogonal segments.
A “diagonal” resistor is drawn with a rotated SVG — pins stay on the grid lattice.

---

## 16. How to build and run everything

### Native C++ (solver + CLI tests)

Requires: CMake 3.20+, MinGW-w64 (Windows) or GCC/Clang (Linux/macOS).

```powershell
# Windows (MinGW)
cmake -S . -B build -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Debug
cmake --build build
.\build\circuitcalc_cli.exe

# Linux / macOS
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build
./build/circuitcalc_cli
```

Expected output ends with `ALL TESTS PASSED`.

### WASM module

Requires: Emscripten SDK (emsdk), Python 3.

```powershell
# (Assuming emsdk is already installed and activated — see §8)
emcmake cmake -S . -B build-wasm -DCIRCUITCALC_BUILD_WASM=ON -DCIRCUITCALC_BUILD_CLI=OFF
cmake --build build-wasm
Copy-Item build-wasm/circuitcalc_wasm.js  web/public/wasm/
Copy-Item build-wasm/circuitcalc_wasm.wasm web/public/wasm/
```

### Frontend development server

Requires: Node.js 18+.

```powershell
cd web
npm install
npm run dev          # starts Vite dev server at http://localhost:5173
```

With WASM **disabled** in source, the console logs that the **TypeScript** solver is used.
After rebuilding WASM and re-enabling `tryLoadWasm()`, verify controlled-source circuits
against `mna.ts` before shipping.

### Production build

```powershell
cd web
npm run build        # outputs to web/dist/
npm run preview      # serves dist/ locally for verification
```

---

*End of architecture document.*
