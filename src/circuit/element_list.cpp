#include "circuitcalc/circuit/element_list.hpp"

#include <stdexcept>
#include <utility>

namespace circuitcalc {

ElementList::~ElementList() {
    clear();
}

ElementList::ElementList(ElementList&& other) noexcept
    : head_(other.head_), tail_(other.tail_), size_(other.size_) {
    other.head_ = nullptr;
    other.tail_ = nullptr;
    other.size_ = 0;
}

ElementList& ElementList::operator=(ElementList&& other) noexcept {
    if (this != &other) {
        clear();
        head_ = other.head_;
        tail_ = other.tail_;
        size_ = other.size_;
        other.head_ = nullptr;
        other.tail_ = nullptr;
        other.size_ = 0;
    }
    return *this;
}

void ElementList::push_front(CircuitElement* e) {
    if (e == nullptr) {
        throw std::invalid_argument("ElementList::push_front: null element");
    }
    auto* node = new ElementNode{e, head_};
    head_ = node;
    if (tail_ == nullptr) {
        tail_ = node;
    }
    ++size_;
}

void ElementList::push_back(CircuitElement* e) {
    if (e == nullptr) {
        throw std::invalid_argument("ElementList::push_back: null element");
    }
    auto* node = new ElementNode{e, nullptr};
    if (tail_ == nullptr) {
        head_ = node;
        tail_ = node;
    } else {
        tail_->next = node;
        tail_ = node;
    }
    ++size_;
}

void ElementList::pop_front() {
    if (head_ == nullptr) {
        return;
    }
    ElementNode* const n = head_;
    head_ = n->next;
    if (head_ == nullptr) {
        tail_ = nullptr;
    }
    delete n->element;
    delete n;
    --size_;
}

void ElementList::clear() {
    ElementNode* cur = head_;
    while (cur != nullptr) {
        ElementNode* const next = cur->next;
        delete cur->element;
        delete cur;
        cur = next;
    }
    head_ = nullptr;
    tail_ = nullptr;
    size_ = 0;
}

void ElementList::swap(ElementList& other) noexcept {
    using std::swap;
    swap(head_, other.head_);
    swap(tail_, other.tail_);
    swap(size_, other.size_);
}

}  // namespace circuitcalc
