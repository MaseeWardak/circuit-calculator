#pragma once

#include "circuitcalc/circuit/elements.hpp"

#include <cstddef>

namespace circuitcalc {

/// One node in a singly linked, hand-rolled list of elements.
struct ElementNode {
    CircuitElement* element{nullptr};
    ElementNode* next{nullptr};
};

/// Singly linked list: owns `ElementNode` records and heap-allocated `CircuitElement` objects.
class ElementList {
public:
    ElementList() = default;
    ~ElementList();

    ElementList(const ElementList&) = delete;
    ElementList& operator=(const ElementList&) = delete;

    ElementList(ElementList&& other) noexcept;
    ElementList& operator=(ElementList&& other) noexcept;

    /// Takes ownership of `e` (must be allocated with `new`). Throws if `e` is null.
    void push_front(CircuitElement* e);
    /// Appends at the tail in O(1). Takes ownership of `e`. Throws if `e` is null.
    void push_back(CircuitElement* e);

    /// Removes the first node and destroys its element. No-op if empty.
    void pop_front();

    void clear();

    void swap(ElementList& other) noexcept;

    ElementNode* head() noexcept { return head_; }
    const ElementNode* head() const noexcept { return head_; }

    ElementNode* tail() noexcept { return tail_; }
    const ElementNode* tail() const noexcept { return tail_; }

    bool empty() const noexcept { return head_ == nullptr; }
    std::size_t size() const noexcept { return size_; }

private:
    ElementNode* head_{nullptr};
    ElementNode* tail_{nullptr};
    std::size_t size_{0};
};

inline void swap(ElementList& a, ElementList& b) noexcept {
    a.swap(b);
}

}  // namespace circuitcalc
