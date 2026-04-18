#include "circuitcalc/analysis/dc_solver.hpp"
#include "circuitcalc/netlist/netlist.hpp"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <string>

static bool approx_equal(double a, double b, double tol) {
    return std::fabs(a - b) <= tol;
}

struct CheckFailure {
    std::string label;
    double expected{};
    double actual{};
};

static bool check(const std::string& label, double expected, double actual,
                  double tol, CheckFailure* out_fail) {
    if (approx_equal(expected, actual, tol)) {
        std::cout << "  OK   " << label
                  << "  expected=" << expected
                  << "  actual=" << actual << '\n';
        return true;
    }
    std::cout << "  FAIL " << label
              << "  expected=" << expected
              << "  actual=" << actual << '\n';
    if (out_fail != nullptr) {
        out_fail->label = label;
        out_fail->expected = expected;
        out_fail->actual = actual;
    }
    return false;
}

static void print_result_as_json(const DcAnalysisResult& r) {
    std::cout << "  {\n";
    std::cout << "    \"nodes\": [";
    for (std::size_t i = 0; i < r.num_nodes; ++i) {
        if (i != 0) std::cout << ", ";
        std::cout << r.node_voltage[i];
    }
    std::cout << "],\n";

    std::cout << "    \"resistor_currents\": [";
    for (int i = 0; i < r.num_resistors; ++i) {
        if (i != 0) std::cout << ", ";
        std::cout << r.resistor_current[i];
    }
    std::cout << "],\n";

    std::cout << "    \"voltage_source_currents\": [";
    for (int i = 0; i < r.num_voltage_sources; ++i) {
        if (i != 0) std::cout << ", ";
        std::cout << r.voltage_source_current[i];
    }
    std::cout << "],\n";

    std::cout << "    \"current_source_currents\": [";
    for (int i = 0; i < r.num_current_sources; ++i) {
        if (i != 0) std::cout << ", ";
        std::cout << r.current_source_current[i];
    }
    std::cout << "]\n";
    std::cout << "  }\n";
}

// --- Test 1: 1:1 voltage divider -------------------------------------------
// 10V source on node 1, two 1kΩ resistors in series to ground through node 2.
// Expect V(1)=10, V(2)=5, all branch currents = 5 mA.
static bool test_voltage_divider() {
    std::cout << "TEST voltage divider (10V, 1k + 1k):\n";
    Netlist n;
    n.set_node_count(3);
    n.add_voltage_source(1, 0, 10.0);
    n.add_resistor(1, 2, 1000.0);
    n.add_resistor(2, 0, 1000.0);

    DcSolver s;
    const DcAnalysisResult r = s.solve(n);

    const double tol = 1e-9;
    bool ok = true;
    CheckFailure f;
    ok &= check("V(1) = 10", 10.0, r.node_voltage[1], tol, &f);
    ok &= check("V(2) = 5", 5.0, r.node_voltage[2], tol, &f);
    ok &= check("I(R1)   = 5 mA", 0.005, r.resistor_current[0], tol, &f);
    ok &= check("I(R2)   = 5 mA", 0.005, r.resistor_current[1], tol, &f);
    // SPICE sign convention: supplying source -> negative current.
    ok &= check("I(Vs)   = -5 mA (supplying)", -0.005, r.voltage_source_current[0], tol, &f);
    print_result_as_json(r);
    return ok;
}

// --- Test 2: current source driving parallel resistors ----------------------
// 2 mA from ground into node 1; two 1kΩ resistors from node 1 to ground.
// Equivalent R = 500 Ω -> V(1) = 2 mA * 500 Ω = 1.0 V.
// Each resistor carries 1 mA.
static bool test_current_source_parallel() {
    std::cout << "TEST current source into 1k||1k:\n";
    Netlist n;
    n.set_node_count(2);
    n.add_current_source(0, 1, 0.002);
    n.add_resistor(1, 0, 1000.0);
    n.add_resistor(1, 0, 1000.0);

    DcSolver s;
    const DcAnalysisResult r = s.solve(n);

    const double tol = 1e-9;
    bool ok = true;
    CheckFailure f;
    ok &= check("V(1) = 1 V", 1.0, r.node_voltage[1], tol, &f);
    ok &= check("I(R1) = 1 mA", 0.001, r.resistor_current[0], tol, &f);
    ok &= check("I(R2) = 1 mA", 0.001, r.resistor_current[1], tol, &f);
    print_result_as_json(r);
    return ok;
}

// --- Test 3: two voltage sources and a shared branch ------------------------
// Node 1 held at 10V by Vs1 (1→0). Node 2 held at 4V by Vs2 (2→0).
// Resistor R = 2 kΩ between nodes 1 and 2.
// Expect V(1)=10, V(2)=4, I(R) = 3 mA (from 1 -> 2).
// Vs1 supplies 3 mA (SPICE sign: -3 mA); Vs2 absorbs 3 mA (SPICE sign: +3 mA).
static bool test_two_voltage_sources() {
    std::cout << "TEST two voltage sources through a resistor:\n";
    Netlist n;
    n.set_node_count(3);
    n.add_voltage_source(1, 0, 10.0);
    n.add_voltage_source(2, 0, 4.0);
    n.add_resistor(1, 2, 2000.0);

    DcSolver s;
    const DcAnalysisResult r = s.solve(n);

    const double tol = 1e-9;
    bool ok = true;
    CheckFailure f;
    ok &= check("V(1) = 10", 10.0, r.node_voltage[1], tol, &f);
    ok &= check("V(2) = 4", 4.0, r.node_voltage[2], tol, &f);
    ok &= check("I(R)   = 3 mA", 0.003, r.resistor_current[0], tol, &f);
    ok &= check("I(Vs1) = -3 mA (supplying)", -0.003, r.voltage_source_current[0], tol, &f);
    ok &= check("I(Vs2) = 3 mA (absorbing)", 0.003, r.voltage_source_current[1], tol, &f);
    print_result_as_json(r);
    return ok;
}

int main() {
    std::cout.setf(std::ios::fixed);
    std::cout << std::setprecision(6);

    bool all_ok = true;
    all_ok &= test_voltage_divider();
    std::cout << '\n';
    all_ok &= test_current_source_parallel();
    std::cout << '\n';
    all_ok &= test_two_voltage_sources();
    std::cout << '\n';

    if (all_ok) {
        std::cout << "ALL TESTS PASSED\n";
        return 0;
    }
    std::cout << "SOME TESTS FAILED\n";
    return 1;
}
