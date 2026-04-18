#pragma once

#include "circuitcalc/analysis/analysis_result.hpp"
#include "circuitcalc/netlist/netlist.hpp"

#include <string>

/// JSON contract (both sides must match):
///
/// INPUT  { "node_count": N,
///          "branches": [{"type":"R"|"V"|"I","n1":int,"n2":int,"value":double}, ...] }
///
/// OUTPUT { "ok": true,
///          "node_voltages": [v0, v1, ...],
///          "branch_currents": [i0, i1, ...] }   -- same order as input branches
///       | { "ok": false, "error": "message" }

struct ParsedCircuit {
    Netlist netlist;

    static constexpr int kMaxBranches =
        Netlist::kMaxResistors + Netlist::kMaxCurrentSources + Netlist::kMaxVoltageSources;

    char  branch_types[kMaxBranches];   // 'R', 'V', or 'I'
    int   num_branches{0};
};

/// Parse JSON input string into a Netlist + branch-order record.
/// Throws circuit_error on malformed input or constraint violations.
ParsedCircuit parse_netlist_json(const char* json);

/// Serialize a solved result back to JSON.
std::string result_to_json(const DcAnalysisResult& result,
                           const ParsedCircuit& circuit);

/// Serialize an error message to JSON.
std::string error_to_json(const std::string& msg);
