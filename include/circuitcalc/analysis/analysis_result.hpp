#pragma once

#include "circuitcalc/netlist/netlist.hpp"

#include <cstddef>

/// Result of a DC linear analysis.
///
/// Sign conventions:
///  * `node_voltage[i]` is the potential at node `i` relative to node 0 (ground).
///  * `resistor_current[k]` flows from `node_a` to `node_b` (positive when V_a > V_b).
///  * `current_source_current[k]` equals the source's set value (n_from → n_to).
///  * `voltage_source_current[k]` — SPICE convention: positive = current entering the
///    plus terminal from the external circuit (negative if source is supplying power).
///  * `vccs_current[k]` = gm * (V_ctrl+ − V_ctrl−), flowing n_out_from → n_out_to.
///  * `vcvs_current[k]` — SPICE convention, same as voltage_source_current.
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

    int num_vccs{0};
    double vccs_current[Netlist::kMaxVccs]{};

    int num_vcvs{0};
    double vcvs_current[Netlist::kMaxVcvs]{};

    int num_cccs{0};
    double cccs_current[Netlist::kMaxCccs]{};

    int num_ccvs{0};
    double ccvs_current[Netlist::kMaxCcvs]{};
};
