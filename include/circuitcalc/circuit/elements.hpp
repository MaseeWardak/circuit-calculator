#pragma once

/// Base type for anything that can sit in an `ElementList` (hand-rolled list of devices).
class CircuitElement {
public:
    enum class Kind { Resistor, CurrentSource, VoltageSource };

    CircuitElement() = default;
    virtual ~CircuitElement() = default;

    CircuitElement(const CircuitElement&) = delete;
    CircuitElement& operator=(const CircuitElement&) = delete;

    virtual Kind kind() const noexcept = 0;
};

class Resistor final : public CircuitElement {
public:
    Resistor(int node_a, int node_b, double ohms)
        : node_a_(node_a), node_b_(node_b), ohms_(ohms) {}

    Kind kind() const noexcept override { return Kind::Resistor; }

    int node_a() const noexcept { return node_a_; }
    int node_b() const noexcept { return node_b_; }
    double ohms() const noexcept { return ohms_; }

private:
    int node_a_{};
    int node_b_{};
    double ohms_{};
};

class CurrentSource final : public CircuitElement {
public:
    CurrentSource(int node_from, int node_to, double amperes)
        : node_from_(node_from), node_to_(node_to), amperes_(amperes) {}

    Kind kind() const noexcept override { return Kind::CurrentSource; }

    int node_from() const noexcept { return node_from_; }
    int node_to() const noexcept { return node_to_; }
    double amperes() const noexcept { return amperes_; }

private:
    int node_from_{};
    int node_to_{};
    double amperes_{};
};

class VoltageSource final : public CircuitElement {
public:
    VoltageSource(int node_plus, int node_minus, double volts)
        : node_plus_(node_plus), node_minus_(node_minus), volts_(volts) {}

    Kind kind() const noexcept override { return Kind::VoltageSource; }

    int node_plus() const noexcept { return node_plus_; }
    int node_minus() const noexcept { return node_minus_; }
    double volts() const noexcept { return volts_; }

private:
    int node_plus_{};
    int node_minus_{};
    double volts_{};
};
