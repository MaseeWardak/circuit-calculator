#include "circuitcalc/core/matrix.hpp"

#include <cmath>
#include <limits>
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

static double abs_d(double x) {
    return x < 0.0 ? -x : x;
}

void Matrix::solve_gaussian(Matrix& a, double* b, std::size_t n) {
    if (a.rows_ != n || a.cols_ != n) {
        throw circuit_error("solve_gaussian: matrix must be n-by-n");
    }

    double tol = std::numeric_limits<double>::epsilon() * 1e6;
    if (tol < 1e-15) {
        tol = 1e-15;
    }

    for (std::size_t k = 0; k < n; ++k) {
        std::size_t pivot = k;
        double best = abs_d(a.at(k, k));
        for (std::size_t r = k + 1; r < n; ++r) {
            const double v = abs_d(a.at(r, k));
            if (v > best) {
                best = v;
                pivot = r;
            }
        }
        if (best < tol) {
            throw singular_matrix_error("matrix is singular or ill-conditioned");
        }

        if (pivot != k) {
            for (std::size_t c = 0; c < n; ++c) {
                const double tmp = a.at(k, c);
                a.at(k, c) = a.at(pivot, c);
                a.at(pivot, c) = tmp;
            }
            const double tb = b[k];
            b[k] = b[pivot];
            b[pivot] = tb;
        }

        const double akk = a.at(k, k);
        for (std::size_t r = k + 1; r < n; ++r) {
            const double factor = a.at(r, k) / akk;
            a.at(r, k) = 0.0;
            for (std::size_t c = k + 1; c < n; ++c) {
                a.at(r, c) -= factor * a.at(k, c);
            }
            b[r] -= factor * b[k];
        }
    }

    for (std::size_t r = n; r-- > 0;) {
        double sum = b[r];
        for (std::size_t c = r + 1; c < n; ++c) {
            sum -= a.at(r, c) * b[c];
        }
        const double arr = a.at(r, r);
        if (abs_d(arr) < tol) {
            throw singular_matrix_error("back-substitution failed");
        }
        b[r] = sum / arr;
    }
}
