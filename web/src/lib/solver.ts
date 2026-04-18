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

async function tryLoadWasm(): Promise<WasmModule | null> {
  if (wasmLoadAttempted) return wasmModule;
  wasmLoadAttempted = true;
  try {
    // Dynamic import; Vite will leave this as-is since it's a runtime URL.
    // The script sets window.createCircuitCalc (from Emscripten EXPORT_NAME).
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/wasm/circuitcalc_wasm.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('WASM script not found'));
      document.head.appendChild(s);
    });
    const factory = (window as unknown as Record<string, unknown>)['createCircuitCalc'] as
      ((opts?: unknown) => Promise<WasmModule>) | undefined;
    if (!factory) throw new Error('createCircuitCalc not on window');
    wasmModule = await factory();
    console.info('[solver] Using C++ WASM engine.');
    return wasmModule;
  } catch {
    console.info('[solver] WASM not available – using TypeScript fallback solver.');
    return null;
  }
}

export async function solve(input: CircuitInput): Promise<SolveResult> {
  const wasm = await tryLoadWasm();
  if (wasm) {
    try {
      const json = wasm.solve_circuit(JSON.stringify(input));
      return JSON.parse(json) as SolveResult;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  // TypeScript fallback (synchronous, wrapped in a promise for uniform API)
  return solveTs(input);
}
