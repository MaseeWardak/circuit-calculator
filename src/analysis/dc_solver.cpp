#include "circuitcalc/analysis/dc_solver.hpp"

namespace circuitcalc {

DcAnalysisResult DcSolver::solve(const Netlist& netlist) const {
    (void)netlist;
    // TODO: MNA assembly and linear solve
    return {};
}

}  // namespace circuitcalc
