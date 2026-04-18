#pragma once

#include "circuitcalc/netlist/netlist.hpp"

#include <cstddef>

/// Result of a DC linear analysis.
///
/// Sign conventions:
///  * `node_voltage[i]` is the potential at node `i` relative to node 0 (ground).
///  * `resistor_current[k]` flows from `node_a` to `node_b` of the k-th resistor
///    (positive when V(node_a) > V(node_b)).
///  * `current_source_current[k]` is reported equal to the source's set value
///    (current flows from `node_from` to `node_to` through the source).
///  * `voltage_source_current[k]` follows SPICE convention: positive means
///    current flowing from `+` to `-` through the source (i.e., entering the
///    plus terminal from the external circuit). A source supplying power to
///    the external circuit reports a negative value here.
struct DcAnalysisResult {
    static constexpr std::size_t kMaxNodes = 256;

    std::size_t num_nodes{0};
    double node_voltage[kMaxNodes]{};

    int num_resistors{0};
    double resistor_current[Netlist::kMaxResistors]{};

    int num_current_sources{0};
    double current_source_current[Netlist::kMaxCurrentSources]{};

    int num_voltage_sources{0};
    double voltage_source_current[Netlist::kMaxVoltageSources]{};
};
