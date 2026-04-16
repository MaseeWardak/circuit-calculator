cmake_minimum_required(VERSION 3.20)
project(CircuitCalculator VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(CIRCUITCALC_BUILD_CLI "Build the command-line demo" ON)

add_library(circuitcalc STATIC
    src/circuit/element_list.cpp
    src/core/matrix.cpp
    src/netlist/netlist.cpp
    src/analysis/dc_solver.cpp
)

target_include_directories(circuitcalc
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(circuitcalc PUBLIC cxx_std_17)

if(MSVC)
    target_compile_options(circuitcalc PRIVATE /W4 /permissive-)
else()
    target_compile_options(circuitcalc PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(CIRCUITCALC_BUILD_CLI)
    add_executable(circuitcalc_cli apps/cli/main.cpp)
    target_link_libraries(circuitcalc_cli PRIVATE circuitcalc)
endif()
