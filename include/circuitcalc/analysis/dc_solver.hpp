#pragma once

#include "circuitcalc/analysis/analysis_result.hpp"
#include "circuitcalc/netlist/netlist.hpp"

namespace circuitcalc {

class DcSolver {
public:
    DcAnalysisResult solve(const Netlist& netlist) const;
};

}  // namespace circuitcalc
