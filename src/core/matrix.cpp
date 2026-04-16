#include "circuitcalc/core/matrix.hpp"

#include <stdexcept>

Matrix::Matrix(std::size_t rows, std::size_t cols) : rows_(rows), cols_(cols) {
    const std::size_t n = rows * cols;
    data_ = new double[n];
    for (std::size_t i = 0; i < n; ++i) {
        data_[i] = 0.0;
    }
}

Matrix::~Matrix() {
    delete[] data_;
    data_ = nullptr;
}

double& Matrix::at(std::size_t r, std::size_t c) {
    return data_[r * cols_ + c];
}

double Matrix::at(std::size_t r, std::size_t c) const {
    return data_[r * cols_ + c];
}

void Matrix::solve_gaussian(Matrix& a, double* b, std::size_t n) {
    (void)a;
    (void)b;
    (void)n;
    throw std::logic_error("Matrix::solve_gaussian not implemented");
}
