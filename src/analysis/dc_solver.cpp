#include "circuitcalc/analysis/dc_solver.hpp"

#include "circuitcalc/core/matrix.hpp"

#include <stdexcept>

// Maps a circuit node index to its row/column in the MNA system.
// Node 0 is ground (no unknown) → -1.  Non-ground node n → n-1.
static int unknown_index(int node) {
    return node <= 0 ? -1 : node - 1;
}

DcAnalysisResult DcSolver::solve(const Netlist& netlist) const {
    const std::size_t n_nodes = netlist.node_count();
    if (n_nodes < 1)
        throw std::invalid_argument("netlist has no nodes");
    if (n_nodes > DcAnalysisResult::kMaxNodes)
        throw std::length_error("too many nodes for DcAnalysisResult buffer");

    const int n_free = static_cast<int>(n_nodes) - 1;
    const int n_vs   = netlist.voltage_source_count();
    const int n_vcvs = netlist.vcvs_count();
    const int n_hs   = netlist.ccvs_count();  // each H needs one extra unknown
    // n_cccs (F) needs NO extra unknown — it reuses the VS current column.
    const int dim    = n_free + n_vs + n_vcvs + n_hs;

    if (dim <= 0) {
        DcAnalysisResult empty{};
        empty.num_nodes = n_nodes;
        return empty;
    }

    // Validate voltage sources
    for (int vi = 0; vi < n_vs; ++vi) {
        const VoltageSourceEntry& vs = netlist.voltage_source(vi);
        if (vs.node_plus == 0 && vs.node_minus == 0)
            throw circuit_error("voltage source has both terminals tied to ground");
    }

    Matrix a(static_cast<std::size_t>(dim), static_cast<std::size_t>(dim));
    double* b = new double[static_cast<std::size_t>(dim)];
    for (int i = 0; i < dim; ++i) b[i] = 0.0;

    auto A = [&](int r, int c) -> double& {
        return a.at(static_cast<std::size_t>(r), static_cast<std::size_t>(c));
    };

    // ── Resistors ─────────────────────────────────────────────────────────
    for (int ri = 0; ri < netlist.resistor_count(); ++ri) {
        const ResistorEntry& r = netlist.resistor(ri);
        if (r.ohms <= 0.0) { delete[] b; throw circuit_error("non-positive resistance"); }
        const double g = 1.0 / r.ohms;
        const int ua = unknown_index(r.node_a);
        const int ub = unknown_index(r.node_b);
        if (ua >= 0) A(ua, ua) += g;
        if (ub >= 0) A(ub, ub) += g;
        if (ua >= 0 && ub >= 0) { A(ua, ub) -= g; A(ub, ua) -= g; }
    }

    // ── Current sources ───────────────────────────────────────────────────
    for (int ci = 0; ci < netlist.current_source_count(); ++ci) {
        const CurrentSourceEntry& cs = netlist.current_source(ci);
        const int uf = unknown_index(cs.node_from);
        const int ut = unknown_index(cs.node_to);
        if (uf >= 0) b[uf] -= cs.amperes;
        if (ut >= 0) b[ut] += cs.amperes;
    }

    // ── VCCS (G): I = gm * (V_ctrl+ − V_ctrl−) ───────────────────────────
    // Also handles CCCS-from-resistor which is emitted as G by the frontend.
    for (int gi = 0; gi < netlist.vccs_count(); ++gi) {
        const VccsEntry& g = netlist.vccs(gi);
        const int uf  = unknown_index(g.n_out_from);
        const int ut  = unknown_index(g.n_out_to);
        const int ucp = unknown_index(g.n_ctrl_plus);
        const int ucm = unknown_index(g.n_ctrl_minus);
        if (ut  >= 0 && ucp >= 0) A(ut,  ucp) += g.gm;
        if (ut  >= 0 && ucm >= 0) A(ut,  ucm) -= g.gm;
        if (uf  >= 0 && ucp >= 0) A(uf,  ucp) -= g.gm;
        if (uf  >= 0 && ucm >= 0) A(uf,  ucm) += g.gm;
    }

    // ── Independent voltage sources ───────────────────────────────────────
    for (int k = 0; k < n_vs; ++k) {
        const VoltageSourceEntry& vs = netlist.voltage_source(k);
        const int col = n_free + k;
        const int up  = unknown_index(vs.node_plus);
        const int um  = unknown_index(vs.node_minus);
        if (up >= 0) { A(up, col) += 1.0; A(col, up) += 1.0; }
        if (um >= 0) { A(um, col) -= 1.0; A(col, um) -= 1.0; }
        b[col] = vs.volts;
    }

    // ── VCVS (E): V_out+ − V_out− = mu * (V_ctrl+ − V_ctrl−) ─────────────
    // Also handles CCVS-from-resistor emitted as E by the frontend.
    for (int k = 0; k < n_vcvs; ++k) {
        const VcvsEntry& e = netlist.vcvs(k);
        const int col = n_free + n_vs + k;
        const int up  = unknown_index(e.n_out_plus);
        const int um  = unknown_index(e.n_out_minus);
        const int ucp = unknown_index(e.n_ctrl_plus);
        const int ucm = unknown_index(e.n_ctrl_minus);
        if (up >= 0) { A(up, col) += 1.0; A(col, up) += 1.0; }
        if (um >= 0) { A(um, col) -= 1.0; A(col, um) -= 1.0; }
        if (ucp >= 0) A(col, ucp) -= e.mu;
        if (ucm >= 0) A(col, ucm) += e.mu;
        b[col] = 0.0;
    }

    // ── CCCS (F): I_out = beta * I_vs_k ───────────────────────────────────
    // No extra unknown — modifies existing VS current column directly.
    for (int k = 0; k < netlist.cccs_count(); ++k) {
        const CccsEntry& f = netlist.cccs(k);
        const int col_vs = n_free + f.vs_ctrl_idx;
        const int uf = unknown_index(f.n_out_from);
        const int ut = unknown_index(f.n_out_to);
        if (ut >= 0) A(ut, col_vs) += f.beta;
        if (uf >= 0) A(uf, col_vs) -= f.beta;
    }

    // ── CCVS (H): V_out+ − V_out− = rm * I_vs_k ──────────────────────────
    // 1 extra unknown per H at col = n_free + n_vs + n_vcvs + k.
    for (int k = 0; k < n_hs; ++k) {
        const CcvsEntry& h = netlist.ccvs(k);
        const int col_vs = n_free + h.vs_ctrl_idx;
        const int col    = n_free + n_vs + n_vcvs + k;
        const int up = unknown_index(h.n_out_plus);
        const int um = unknown_index(h.n_out_minus);
        // KCL coupling (output terminal currents)
        if (up >= 0) { A(up, col) += 1.0; A(col, up) += 1.0; }
        if (um >= 0) { A(um, col) -= 1.0; A(col, um) -= 1.0; }
        // KVL: V_out+ − V_out− = rm · I_vs_k  →  A[col][col_vs] −= rm
        A(col, col_vs) -= h.rm;
        b[col] = 0.0;
    }

    try {
        Matrix::solve_gaussian(a, b, static_cast<std::size_t>(dim));
    } catch (...) {
        delete[] b;
        throw;
    }

    // ── Extract results ───────────────────────────────────────────────────
    DcAnalysisResult out{};
    out.num_nodes     = n_nodes;
    out.node_voltage[0] = 0.0;
    for (int i = 1; i < static_cast<int>(n_nodes); ++i)
        out.node_voltage[i] = b[i - 1];

    out.num_resistors = netlist.resistor_count();
    for (int ri = 0; ri < out.num_resistors; ++ri) {
        const ResistorEntry& r = netlist.resistor(ri);
        out.resistor_current[ri] = (out.node_voltage[r.node_a] - out.node_voltage[r.node_b]) / r.ohms;
    }

    out.num_current_sources = netlist.current_source_count();
    for (int ci = 0; ci < out.num_current_sources; ++ci)
        out.current_source_current[ci] = netlist.current_source(ci).amperes;

    out.num_voltage_sources = n_vs;
    for (int k = 0; k < n_vs; ++k)
        out.voltage_source_current[k] = b[n_free + k];

    out.num_vccs = netlist.vccs_count();
    for (int gi = 0; gi < out.num_vccs; ++gi) {
        const VccsEntry& g = netlist.vccs(gi);
        out.vccs_current[gi] = g.gm * (out.node_voltage[g.n_ctrl_plus] - out.node_voltage[g.n_ctrl_minus]);
    }

    out.num_vcvs = n_vcvs;
    for (int k = 0; k < n_vcvs; ++k)
        out.vcvs_current[k] = b[n_free + n_vs + k];

    // CCCS: I_out = beta * I_vs_k  (I_vs_k is the VS current extra unknown)
    out.num_cccs = netlist.cccs_count();
    for (int k = 0; k < out.num_cccs; ++k) {
        const CccsEntry& f = netlist.cccs(k);
        out.cccs_current[k] = f.beta * b[n_free + f.vs_ctrl_idx];
    }

    // CCVS: output current is the extra unknown
    out.num_ccvs = n_hs;
    for (int k = 0; k < n_hs; ++k)
        out.ccvs_current[k] = b[n_free + n_vs + n_vcvs + k];

    delete[] b;
    return out;
}
