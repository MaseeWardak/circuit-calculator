#pragma once

#include "circuitcalc/analysis/analysis_result.hpp"
#include "circuitcalc/netlist/netlist.hpp"

class DcSolver {
public:
    DcAnalysisResult solve(const Netlist& netlist) const;
};
