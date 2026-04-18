#include "circuitcalc/analysis/dc_solver.hpp"

#include "circuitcalc/core/matrix.hpp"

#include <stdexcept>

// Maps a circuit node index to its row/column in the MNA system.
// Node 0 is ground and has no unknown, so it returns -1.
// Non-ground node `n` maps to MNA index `n - 1`.
static int unknown_index(int node) {
    if (node <= 0) {
        return -1;
    }
    return node - 1;
}

DcAnalysisResult DcSolver::solve(const Netlist& netlist) const {
    const std::size_t n_nodes = netlist.node_count();
    if (n_nodes < 1) {
        throw std::invalid_argument("netlist has no nodes");
    }
    if (n_nodes > DcAnalysisResult::kMaxNodes) {
        throw std::length_error("too many nodes for DcAnalysisResult buffer");
    }

    const int n_free = static_cast<int>(n_nodes) - 1;
    const int n_vs = netlist.voltage_source_count();
    const int dim = n_free + n_vs;

    if (dim <= 0) {
        DcAnalysisResult empty{};
        empty.num_nodes = n_nodes;
        return empty;
    }

    for (int vi = 0; vi < n_vs; ++vi) {
        const VoltageSourceEntry& vs = netlist.voltage_source(vi);
        if (vs.node_plus == 0 && vs.node_minus == 0) {
            throw circuit_error("voltage source has both terminals tied to ground");
        }
    }

    Matrix a(static_cast<std::size_t>(dim), static_cast<std::size_t>(dim));
    double* b = new double[static_cast<std::size_t>(dim)];
    for (int i = 0; i < dim; ++i) {
        b[i] = 0.0;
    }

    for (int ri = 0; ri < netlist.resistor_count(); ++ri) {
        const ResistorEntry& r = netlist.resistor(ri);
        if (r.ohms <= 0.0) {
            delete[] b;
            throw circuit_error("non-positive resistance");
        }
        const double g = 1.0 / r.ohms;
        const int ua = unknown_index(r.node_a);
        const int ub = unknown_index(r.node_b);
        if (ua >= 0) {
            a.at(static_cast<std::size_t>(ua), static_cast<std::size_t>(ua)) += g;
        }
        if (ub >= 0) {
            a.at(static_cast<std::size_t>(ub), static_cast<std::size_t>(ub)) += g;
        }
        if (ua >= 0 && ub >= 0) {
            a.at(static_cast<std::size_t>(ua), static_cast<std::size_t>(ub)) -= g;
            a.at(static_cast<std::size_t>(ub), static_cast<std::size_t>(ua)) -= g;
        }
    }

    for (int ci = 0; ci < netlist.current_source_count(); ++ci) {
        const CurrentSourceEntry& cs = netlist.current_source(ci);
        const int uf = unknown_index(cs.node_from);
        const int ut = unknown_index(cs.node_to);
        if (uf >= 0) {
            b[uf] -= cs.amperes;
        }
        if (ut >= 0) {
            b[ut] += cs.amperes;
        }
    }

    for (int k = 0; k < n_vs; ++k) {
        const VoltageSourceEntry& vs = netlist.voltage_source(k);
        const int col = n_free + k;
        const int up = unknown_index(vs.node_plus);
        const int um = unknown_index(vs.node_minus);
        if (up >= 0) {
            a.at(static_cast<std::size_t>(up), static_cast<std::size_t>(col)) += 1.0;
            a.at(static_cast<std::size_t>(col), static_cast<std::size_t>(up)) += 1.0;
        }
        if (um >= 0) {
            a.at(static_cast<std::size_t>(um), static_cast<std::size_t>(col)) -= 1.0;
            a.at(static_cast<std::size_t>(col), static_cast<std::size_t>(um)) -= 1.0;
        }
        b[col] = vs.volts;
    }

    try {
        Matrix::solve_gaussian(a, b, static_cast<std::size_t>(dim));
    } catch (...) {
        delete[] b;
        throw;
    }

    DcAnalysisResult out{};
    out.num_nodes = n_nodes;
    out.node_voltage[0] = 0.0;
    for (int i = 1; i < static_cast<int>(n_nodes); ++i) {
        out.node_voltage[i] = b[i - 1];
    }

    out.num_resistors = netlist.resistor_count();
    for (int ri = 0; ri < out.num_resistors; ++ri) {
        const ResistorEntry& r = netlist.resistor(ri);
        const double va = out.node_voltage[r.node_a];
        const double vb = out.node_voltage[r.node_b];
        out.resistor_current[ri] = (va - vb) / r.ohms;
    }

    out.num_current_sources = netlist.current_source_count();
    for (int ci = 0; ci < out.num_current_sources; ++ci) {
        out.current_source_current[ci] = netlist.current_source(ci).amperes;
    }

    out.num_voltage_sources = n_vs;
    for (int k = 0; k < n_vs; ++k) {
        out.voltage_source_current[k] = b[n_free + k];
    }

    delete[] b;
    return out;
}
