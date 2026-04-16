#pragma once

#include "circuitcalc/core/errors.hpp"

#include <cstddef>

namespace circuitcalc {

/// Dense row-major matrix (placeholder for MNA assembly / solve).
class Matrix {
public:
    Matrix(std::size_t rows, std::size_t cols);
    ~Matrix();

    Matrix(const Matrix&) = delete;
    Matrix& operator=(const Matrix&) = delete;

    std::size_t rows() const { return rows_; }
    std::size_t cols() const { return cols_; }

    double& at(std::size_t r, std::size_t c);
    double at(std::size_t r, std::size_t c) const;

    static void solve_gaussian(Matrix& a, double* b, std::size_t n);

private:
    std::size_t rows_{};
    std::size_t cols_{};
    double* data_{nullptr};
};

}  // namespace circuitcalc
