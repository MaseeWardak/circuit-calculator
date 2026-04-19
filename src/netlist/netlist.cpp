#include "circuitcalc/netlist/netlist.hpp"

#include <stdexcept>

static int max_node_index(int a, int b) {
    return a > b ? a : b;
}

static int max4(int a, int b, int c, int d) {
    return max_node_index(max_node_index(a, b), max_node_index(c, d));
}

void Netlist::set_node_count(std::size_t count) {
    if (count == 0) {
        throw std::invalid_argument("node count must be positive");
    }
    node_count_ = count;
}

void Netlist::add_resistor(int node_a, int node_b, double ohms) {
    if (num_resistors_ >= kMaxResistors) {
        throw std::length_error("too many resistors");
    }
    if (node_a < 0 || node_b < 0
        || static_cast<std::size_t>(max_node_index(node_a, node_b)) >= node_count_) {
        throw std::out_of_range("resistor node index out of range");
    }
    if (ohms <= 0.0) {
        throw std::invalid_argument("resistance must be positive");
    }
    resistors_[num_resistors_] = { node_a, node_b, ohms };
    ++num_resistors_;
}

void Netlist::add_current_source(int node_from, int node_to, double amperes) {
    if (num_current_sources_ >= kMaxCurrentSources) {
        throw std::length_error("too many current sources");
    }
    if (node_from < 0 || node_to < 0
        || static_cast<std::size_t>(max_node_index(node_from, node_to)) >= node_count_) {
        throw std::out_of_range("current source node index out of range");
    }
    current_sources_[num_current_sources_] = { node_from, node_to, amperes };
    ++num_current_sources_;
}

void Netlist::add_voltage_source(int node_plus, int node_minus, double volts) {
    if (num_voltage_sources_ >= kMaxVoltageSources) {
        throw std::length_error("too many voltage sources");
    }
    if (node_plus < 0 || node_minus < 0
        || static_cast<std::size_t>(max_node_index(node_plus, node_minus)) >= node_count_) {
        throw std::out_of_range("voltage source node index out of range");
    }
    if (node_plus == node_minus) {
        throw std::invalid_argument("voltage source nodes must differ");
    }
    voltage_sources_[num_voltage_sources_] = { node_plus, node_minus, volts };
    ++num_voltage_sources_;
}

void Netlist::add_vccs(int n_out_from, int n_out_to,
                       int n_ctrl_plus, int n_ctrl_minus, double gm) {
    if (num_vccs_ >= kMaxVccs) {
        throw std::length_error("too many VCCS elements");
    }
    if (n_out_from < 0 || n_out_to < 0 || n_ctrl_plus < 0 || n_ctrl_minus < 0
        || static_cast<std::size_t>(max4(n_out_from, n_out_to, n_ctrl_plus, n_ctrl_minus)) >= node_count_) {
        throw std::out_of_range("VCCS node index out of range");
    }
    vccs_[num_vccs_] = { n_out_from, n_out_to, n_ctrl_plus, n_ctrl_minus, gm };
    ++num_vccs_;
}

void Netlist::add_vcvs(int n_out_plus, int n_out_minus,
                       int n_ctrl_plus, int n_ctrl_minus, double mu) {
    if (num_vcvs_ >= kMaxVcvs) {
        throw std::length_error("too many VCVS elements");
    }
    if (n_out_plus < 0 || n_out_minus < 0 || n_ctrl_plus < 0 || n_ctrl_minus < 0
        || static_cast<std::size_t>(max4(n_out_plus, n_out_minus, n_ctrl_plus, n_ctrl_minus)) >= node_count_) {
        throw std::out_of_range("VCVS node index out of range");
    }
    vcvs_[num_vcvs_] = { n_out_plus, n_out_minus, n_ctrl_plus, n_ctrl_minus, mu };
    ++num_vcvs_;
}

const ResistorEntry& Netlist::resistor(int i) const {
    if (i < 0 || i >= num_resistors_) throw std::out_of_range("resistor index");
    return resistors_[i];
}

const CurrentSourceEntry& Netlist::current_source(int i) const {
    if (i < 0 || i >= num_current_sources_) throw std::out_of_range("current source index");
    return current_sources_[i];
}

const VoltageSourceEntry& Netlist::voltage_source(int i) const {
    if (i < 0 || i >= num_voltage_sources_) throw std::out_of_range("voltage source index");
    return voltage_sources_[i];
}

const VccsEntry& Netlist::vccs(int i) const {
    if (i < 0 || i >= num_vccs_) throw std::out_of_range("VCCS index");
    return vccs_[i];
}

const VcvsEntry& Netlist::vcvs(int i) const {
    if (i < 0 || i >= num_vcvs_) throw std::out_of_range("VCVS index");
    return vcvs_[i];
}

void Netlist::add_cccs(int n_out_from, int n_out_to, int vs_ctrl_idx, double beta) {
    if (num_cccs_ >= kMaxCccs) throw std::length_error("too many CCCS elements");
    if (n_out_from < 0 || n_out_to < 0)
        throw std::out_of_range("CCCS output node index out of range");
    if (vs_ctrl_idx < 0 || vs_ctrl_idx >= num_voltage_sources_)
        throw std::out_of_range("CCCS vs_ctrl_idx out of range");
    cccs_[num_cccs_++] = { n_out_from, n_out_to, vs_ctrl_idx, beta };
}

void Netlist::add_ccvs(int n_out_plus, int n_out_minus, int vs_ctrl_idx, double rm) {
    if (num_ccvs_ >= kMaxCcvs) throw std::length_error("too many CCVS elements");
    if (n_out_plus < 0 || n_out_minus < 0)
        throw std::out_of_range("CCVS output node index out of range");
    if (vs_ctrl_idx < 0 || vs_ctrl_idx >= num_voltage_sources_)
        throw std::out_of_range("CCVS vs_ctrl_idx out of range");
    ccvs_[num_ccvs_++] = { n_out_plus, n_out_minus, vs_ctrl_idx, rm };
}

const CccsEntry& Netlist::cccs(int i) const {
    if (i < 0 || i >= num_cccs_) throw std::out_of_range("CCCS index");
    return cccs_[i];
}

const CcvsEntry& Netlist::ccvs(int i) const {
    if (i < 0 || i >= num_ccvs_) throw std::out_of_range("CCVS index");
    return ccvs_[i];
}

void Netlist::clear() {
    num_resistors_       = 0;
    num_current_sources_ = 0;
    num_voltage_sources_ = 0;
    num_vccs_            = 0;
    num_vcvs_            = 0;
    num_cccs_            = 0;
    num_ccvs_            = 0;
}
