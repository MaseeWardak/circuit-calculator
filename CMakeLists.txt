cmake_minimum_required(VERSION 3.20)
project(CircuitCalculator VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(CIRCUITCALC_BUILD_CLI  "Build the command-line demo"  ON)
option(CIRCUITCALC_BUILD_WASM "Build the WebAssembly module" OFF)

add_library(circuitcalc STATIC
    src/circuit/element_list.cpp
    src/core/matrix.cpp
    src/netlist/netlist.cpp
    src/analysis/dc_solver.cpp
    src/io/json_io.cpp
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

# ---- CLI demo / golden tests -----------------------------------------------
if(CIRCUITCALC_BUILD_CLI)
    add_executable(circuitcalc_cli apps/cli/main.cpp)
    target_link_libraries(circuitcalc_cli PRIVATE circuitcalc)
endif()

# ---- WebAssembly module (requires Emscripten) -------------------------------
# Build with:
#   emcmake cmake -S . -B build-wasm -DCIRCUITCALC_BUILD_WASM=ON -DCIRCUITCALC_BUILD_CLI=OFF
#   cmake --build build-wasm
# The output (circuitcalc_wasm.js + .wasm) should be copied to web/public/wasm/.
if(CIRCUITCALC_BUILD_WASM)
    if(NOT EMSCRIPTEN)
        message(FATAL_ERROR "CIRCUITCALC_BUILD_WASM requires the Emscripten toolchain. "
                            "Use: emcmake cmake -S . -B build-wasm -DCIRCUITCALC_BUILD_WASM=ON")
    endif()

    add_executable(circuitcalc_wasm apps/wasm/wasm_api.cpp)
    target_link_libraries(circuitcalc_wasm PRIVATE circuitcalc)

    set_target_properties(circuitcalc_wasm PROPERTIES SUFFIX ".js")

    target_link_options(circuitcalc_wasm PRIVATE
        "--bind"
        "-sMODULARIZE=1"
        "-sEXPORT_NAME=createCircuitCalc"
        "-sENVIRONMENT=web"
        "-sALLOW_MEMORY_GROWTH=1"
        "-O2"
    )
endif()
