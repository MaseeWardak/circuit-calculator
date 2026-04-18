#include "circuitcalc/analysis/dc_solver.hpp"
#include "circuitcalc/io/json_io.hpp"

#include <emscripten/bind.h>
#include <string>

/// Entry point called from JavaScript / TypeScript.
/// Accepts the circuit JSON string, returns result JSON string.
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
