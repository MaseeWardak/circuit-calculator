// ---------------------------------------------------------------------------
// Solver entry point.
//
// Tries to use the C++ WebAssembly module (circuitcalc_wasm.js) for exact
// parity with the native engine.  Falls back to the TypeScript MNA
// implementation when WASM has not been built/deployed yet.
//
// To enable WASM:
//   1. Build with Emscripten (see CMakeLists.txt CIRCUITCALC_BUILD_WASM)
//   2. Copy the generated circuitcalc_wasm.js + .wasm into web/public/wasm/
// ---------------------------------------------------------------------------

import type { CircuitInput, SolveResult } from '../types/circuit';
import { solveCircuit as solveTs } from './mna';

type WasmModule = { solve_circuit: (json: string) => string };

let wasmModule: WasmModule | null = null;
let wasmLoadAttempted = false;

// WASM loading is intentionally disabled: the pre-compiled binary pre-dates
// the current F/H (CCCS/CCVS) redesign and crashes with the new JSON format.
// The TypeScript MNA solver is correct and handles all branch types.
// Re-enable once a new WASM binary is built with Emscripten.
async function tryLoadWasm(): Promise<WasmModule | null> {
  if (wasmLoadAttempted) return wasmModule;
  wasmLoadAttempted = true;
  console.info('[solver] WASM disabled – using TypeScript solver.');
  return null;
}

export async function solve(input: CircuitInput): Promise<SolveResult> {
  const wasm = await tryLoadWasm();
  if (wasm) {
    try {
      const json = wasm.solve_circuit(JSON.stringify(input));
      return JSON.parse(json) as SolveResult;
    } catch (e) {
      // WASM failed — fall through to TypeScript solver
      console.warn('[solver] WASM error, falling back to TypeScript solver:', e);
    }
  }
  return solveTs(input);
}
