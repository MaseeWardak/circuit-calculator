#pragma once

#include <cstddef>

struct ResistorEntry {
    int node_a{};
    int node_b{};
    double ohms{1.0};
};

struct CurrentSourceEntry {
    int node_from{};
    int node_to{};
    double amperes{0.0};
};

struct VoltageSourceEntry {
    int node_plus{};
    int node_minus{};
    double volts{0.0};
};

/// Netlist of lumped elements (node 0 = reference). Limits are fixed for now.
class Netlist {
public:
    static constexpr int kMaxResistors = 256;
    static constexpr int kMaxCurrentSources = 128;
    static constexpr int kMaxVoltageSources = 64;

    void set_node_count(std::size_t count);
    std::size_t node_count() const { return node_count_; }

    void add_resistor(int node_a, int node_b, double ohms);
    void add_current_source(int node_from, int node_to, double amperes);
    void add_voltage_source(int node_plus, int node_minus, double volts);

    int resistor_count() const { return num_resistors_; }
    int current_source_count() const { return num_current_sources_; }
    int voltage_source_count() const { return num_voltage_sources_; }

    const ResistorEntry& resistor(int i) const;
    const CurrentSourceEntry& current_source(int i) const;
    const VoltageSourceEntry& voltage_source(int i) const;

    void clear();

private:
    std::size_t node_count_{1};
    ResistorEntry resistors_[kMaxResistors];
    int num_resistors_{0};
    CurrentSourceEntry current_sources_[kMaxCurrentSources];
    int num_current_sources_{0};
    VoltageSourceEntry voltage_sources_[kMaxVoltageSources];
    int num_voltage_sources_{0};
};
