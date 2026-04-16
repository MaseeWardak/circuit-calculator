#pragma once

#include <stdexcept>
#include <string>

class circuit_error : public std::runtime_error {
public:
    explicit circuit_error(const std::string& what) : std::runtime_error(what) {}
};

class singular_matrix_error : public circuit_error {
public:
    explicit singular_matrix_error(const std::string& what) : circuit_error(what) {}
};
