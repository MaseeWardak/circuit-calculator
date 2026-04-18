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

/** Voltage-controlled current source:  I = gm * (V_ctrl_plus − V_ctrl_minus)
 *  Current flows from n_out_from to n_out_to. */
struct VccsEntry {
    int    n_out_from{};
    int    n_out_to{};
    int    n_ctrl_plus{};
    int    n_ctrl_minus{};
    double gm{0.0};
};

/** Voltage-controlled voltage source:  V(out+) − V(out−) = mu * (V_ctrl+ − V_ctrl−) */
struct VcvsEntry {
    int    n_out_plus{};
    int    n_out_minus{};
    int    n_ctrl_plus{};
    int    n_ctrl_minus{};
    double mu{1.0};
};

/**
 * Current-controlled current source:  I_out = beta * I_sense
 * The control port (n_ctrl_plus / n_ctrl_minus) is wired in series and acts as
 * a 0 V ammeter — positive sense current flows INTO n_ctrl_plus.
 * Output current flows from n_out_from to n_out_to through the source.
 */
struct CccsEntry {
    int    n_out_from{};
    int    n_out_to{};
    int    n_ctrl_plus{};
    int    n_ctrl_minus{};
    double beta{1.0};
};

/**
 * Current-controlled voltage source:  V(out+) − V(out−) = rm * I_sense
 * Same sense-port convention as CccsEntry.  rm is transresistance (Ω).
 */
struct CcvsEntry {
    int    n_out_plus{};
    int    n_out_minus{};
    int    n_ctrl_plus{};
    int    n_ctrl_minus{};
    double rm{1.0};
};

/// Netlist of lumped elements (node 0 = reference). Limits are fixed for now.
class Netlist {
public:
    static constexpr int kMaxResistors      = 256;
    static constexpr int kMaxCurrentSources = 128;
    static constexpr int kMaxVoltageSources =  64;
    static constexpr int kMaxVccs           =  64;
    static constexpr int kMaxVcvs           =  64;
    static constexpr int kMaxCccs           =  64;
    static constexpr int kMaxCcvs           =  64;

    void set_node_count(std::size_t count);
    std::size_t node_count() const { return node_count_; }

    void add_resistor(int node_a, int node_b, double ohms);
    void add_current_source(int node_from, int node_to, double amperes);
    void add_voltage_source(int node_plus, int node_minus, double volts);
    void add_vccs(int n_out_from, int n_out_to, int n_ctrl_plus, int n_ctrl_minus, double gm);
    void add_vcvs(int n_out_plus, int n_out_minus, int n_ctrl_plus, int n_ctrl_minus, double mu);
    void add_cccs(int n_out_from, int n_out_to, int n_ctrl_plus, int n_ctrl_minus, double beta);
    void add_ccvs(int n_out_plus, int n_out_minus, int n_ctrl_plus, int n_ctrl_minus, double rm);

    int resistor_count()       const { return num_resistors_; }
    int current_source_count() const { return num_current_sources_; }
    int voltage_source_count() const { return num_voltage_sources_; }
    int vccs_count()           const { return num_vccs_; }
    int vcvs_count()           const { return num_vcvs_; }
    int cccs_count()           const { return num_cccs_; }
    int ccvs_count()           const { return num_ccvs_; }

    const ResistorEntry&      resistor(int i)       const;
    const CurrentSourceEntry& current_source(int i) const;
    const VoltageSourceEntry& voltage_source(int i) const;
    const VccsEntry&          vccs(int i)           const;
    const VcvsEntry&          vcvs(int i)           const;
    const CccsEntry&          cccs(int i)           const;
    const CcvsEntry&          ccvs(int i)           const;

    void clear();

private:
    std::size_t node_count_{1};

    ResistorEntry      resistors_[kMaxResistors];
    int num_resistors_{0};

    CurrentSourceEntry current_sources_[kMaxCurrentSources];
    int num_current_sources_{0};

    VoltageSourceEntry voltage_sources_[kMaxVoltageSources];
    int num_voltage_sources_{0};

    VccsEntry vccs_[kMaxVccs];
    int num_vccs_{0};

    VcvsEntry vcvs_[kMaxVcvs];
    int num_vcvs_{0};

    CccsEntry cccs_[kMaxCccs];
    int num_cccs_{0};

    CcvsEntry ccvs_[kMaxCcvs];
    int num_ccvs_{0};
};
