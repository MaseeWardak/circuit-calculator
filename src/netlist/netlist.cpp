#include "circuitcalc/netlist/netlist.hpp"

#include <stdexcept>

namespace circuitcalc {

namespace {

int max_node_index(int a, int b) {
    return a > b ? a : b;
}

}  // namespace

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
    if (node_a < 0 || node_b < 0 || static_cast<std::size_t>(max_node_index(node_a, node_b)) >= node_count_) {
        throw std::out_of_range("resistor node index out of range");
    }
    if (ohms <= 0.0) {
        throw std::invalid_argument("resistance must be positive");
    }
    resistors_[num_resistors_].node_a = node_a;
    resistors_[num_resistors_].node_b = node_b;
    resistors_[num_resistors_].ohms = ohms;
    ++num_resistors_;
}

void Netlist::add_current_source(int node_from, int node_to, double amperes) {
    if (num_current_sources_ >= kMaxCurrentSources) {
        throw std::length_error("too many current sources");
    }
    if (node_from < 0 || node_to < 0 || static_cast<std::size_t>(max_node_index(node_from, node_to)) >= node_count_) {
        throw std::out_of_range("current source node index out of range");
    }
    current_sources_[num_current_sources_].node_from = node_from;
    current_sources_[num_current_sources_].node_to = node_to;
    current_sources_[num_current_sources_].amperes = amperes;
    ++num_current_sources_;
}

void Netlist::add_voltage_source(int node_plus, int node_minus, double volts) {
    if (num_voltage_sources_ >= kMaxVoltageSources) {
        throw std::length_error("too many voltage sources");
    }
    if (node_plus < 0 || node_minus < 0 || static_cast<std::size_t>(max_node_index(node_plus, node_minus)) >= node_count_) {
        throw std::out_of_range("voltage source node index out of range");
    }
    if (node_plus == node_minus) {
        throw std::invalid_argument("voltage source nodes must differ");
    }
    voltage_sources_[num_voltage_sources_].node_plus = node_plus;
    voltage_sources_[num_voltage_sources_].node_minus = node_minus;
    voltage_sources_[num_voltage_sources_].volts = volts;
    ++num_voltage_sources_;
}

const ResistorEntry& Netlist::resistor(int i) const {
    if (i < 0 || i >= num_resistors_) {
        throw std::out_of_range("resistor index");
    }
    return resistors_[i];
}

const CurrentSourceEntry& Netlist::current_source(int i) const {
    if (i < 0 || i >= num_current_sources_) {
        throw std::out_of_range("current source index");
    }
    return current_sources_[i];
}

const VoltageSourceEntry& Netlist::voltage_source(int i) const {
    if (i < 0 || i >= num_voltage_sources_) {
        throw std::out_of_range("voltage source index");
    }
    return voltage_sources_[i];
}

void Netlist::clear() {
    num_resistors_ = 0;
    num_current_sources_ = 0;
    num_voltage_sources_ = 0;
}

}  // namespace circuitcalc
