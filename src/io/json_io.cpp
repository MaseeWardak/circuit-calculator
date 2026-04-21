#include "circuitcalc/io/json_io.hpp"

#include "circuitcalc/core/errors.hpp"

#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <string>

// ---------------------------------------------------------------------------
// Minimal hand-rolled recursive-descent parser for the fixed circuit schema.
// ---------------------------------------------------------------------------

static void skip_ws(const char* s, int& i) {
    while (s[i] && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) ++i;
}

static void expect_char(const char* s, int& i, char expected) {
    skip_ws(s, i);
    if (s[i] != expected)
        throw circuit_error(std::string("JSON parse: expected '") + expected
                            + "' but got '" + (s[i] ? s[i] : '?') + "'");
    ++i;
}

static std::string parse_string(const char* s, int& i) {
    expect_char(s, i, '"');
    std::string result;
    while (s[i] && s[i] != '"') {
        if (s[i] == '\\' && s[i + 1]) ++i;
        result += s[i++];
    }
    expect_char(s, i, '"');
    return result;
}

static double parse_number(const char* s, int& i) {
    skip_ws(s, i);
    const char* start = s + i;
    if (s[i] == '-') ++i;
    while (isdigit(static_cast<unsigned char>(s[i]))) ++i;
    if (s[i] == '.') { ++i; while (isdigit(static_cast<unsigned char>(s[i]))) ++i; }
    if (s[i] == 'e' || s[i] == 'E') {
        ++i;
        if (s[i] == '+' || s[i] == '-') ++i;
        while (isdigit(static_cast<unsigned char>(s[i]))) ++i;
    }
    if (s + i == start) throw circuit_error("JSON parse: expected a number");
    char buf[64];
    const int len = static_cast<int>(s + i - start);
    if (len >= 64) throw circuit_error("JSON parse: number token too long");
    for (int j = 0; j < len; ++j) buf[j] = start[j];
    buf[len] = '\0';
    return std::strtod(buf, nullptr);
}

static int parse_int(const char* s, int& i) {
    return static_cast<int>(parse_number(s, i));
}

static void skip_value(const char* s, int& i);

static void skip_value(const char* s, int& i) {
    skip_ws(s, i);
    if (s[i] == '"') {
        parse_string(s, i);
    } else if (s[i] == '{') {
        ++i; skip_ws(s, i);
        if (s[i] == '}') { ++i; return; }
        while (true) {
            parse_string(s, i); expect_char(s, i, ':'); skip_value(s, i);
            skip_ws(s, i);
            if (s[i] == '}') { ++i; break; }
            expect_char(s, i, ',');
        }
    } else if (s[i] == '[') {
        ++i; skip_ws(s, i);
        if (s[i] == ']') { ++i; return; }
        while (true) {
            skip_value(s, i); skip_ws(s, i);
            if (s[i] == ']') { ++i; break; }
            expect_char(s, i, ',');
        }
    } else {
        while (s[i] && s[i] != ',' && s[i] != '}' && s[i] != ']'
               && s[i] != ' ' && s[i] != '\n' && s[i] != '\r' && s[i] != '\t')
            ++i;
    }
}

ParsedCircuit parse_netlist_json(const char* json) {
    int i = 0;
    ParsedCircuit out;
    int node_count = 0;

    expect_char(json, i, '{');
    skip_ws(json, i);

    while (json[i] && json[i] != '}') {
        skip_ws(json, i);
        const std::string key = parse_string(json, i);
        expect_char(json, i, ':');
        skip_ws(json, i);

        if (key == "node_count") {
            node_count = parse_int(json, i);
            if (node_count < 1) throw circuit_error("node_count must be at least 1");
            out.netlist.set_node_count(static_cast<std::size_t>(node_count));

        } else if (key == "branches") {
            expect_char(json, i, '[');
            skip_ws(json, i);
            while (json[i] && json[i] != ']') {
                expect_char(json, i, '{');
                if (out.num_branches >= ParsedCircuit::kMaxBranches)
                    throw circuit_error("too many branches");

                std::string type;
                int n1 = 0, n2 = 0, nc1 = -1, nc2 = -1, vs_ctrl_idx = -1;
                double value = 0.0;

                skip_ws(json, i);
                while (json[i] && json[i] != '}') {
                    const std::string bkey = parse_string(json, i);
                    expect_char(json, i, ':');
                    skip_ws(json, i);
                    if      (bkey == "type")         type         = parse_string(json, i);
                    else if (bkey == "n1")           n1           = parse_int(json, i);
                    else if (bkey == "n2")           n2           = parse_int(json, i);
                    else if (bkey == "nc1")          nc1          = parse_int(json, i);
                    else if (bkey == "nc2")          nc2          = parse_int(json, i);
                    else if (bkey == "vs_ctrl_idx")  vs_ctrl_idx  = parse_int(json, i);
                    else if (bkey == "value")        value        = parse_number(json, i);
                    else                             skip_value(json, i);
                    skip_ws(json, i);
                    if (json[i] == ',') ++i;
                }
                expect_char(json, i, '}');

                if (type == "R") {
                    out.netlist.add_resistor(n1, n2, value);
                    out.branch_types[out.num_branches++] = 'R';
                } else if (type == "V") {
                    out.netlist.add_voltage_source(n1, n2, value);
                    out.branch_types[out.num_branches++] = 'V';
                } else if (type == "I") {
                    out.netlist.add_current_source(n1, n2, value);
                    out.branch_types[out.num_branches++] = 'I';
                } else if (type == "G") {
                    if (nc1 < 0 || nc2 < 0)
                        throw circuit_error("VCCS branch missing nc1/nc2 fields");
                    out.netlist.add_vccs(n1, n2, nc1, nc2, value);
                    out.branch_types[out.num_branches++] = 'G';
                } else if (type == "E") {
                    if (nc1 < 0 || nc2 < 0)
                        throw circuit_error("VCVS branch missing nc1/nc2 fields");
                    out.netlist.add_vcvs(n1, n2, nc1, nc2, value);
                    out.branch_types[out.num_branches++] = 'E';
                } else if (type == "F") {
                    // CCCS: controlled by VS current (vs_ctrl_idx required).
                    // CCCS-from-resistor is emitted as type G by the frontend.
                    if (vs_ctrl_idx < 0)
                        throw circuit_error("CCCS branch missing vs_ctrl_idx field");
                    out.netlist.add_cccs(n1, n2, vs_ctrl_idx, value);
                    out.branch_types[out.num_branches++] = 'F';
                } else if (type == "H") {
                    // CCVS: controlled by VS current (vs_ctrl_idx required).
                    // CCVS-from-resistor is emitted as type E by the frontend.
                    if (vs_ctrl_idx < 0)
                        throw circuit_error("CCVS branch missing vs_ctrl_idx field");
                    out.netlist.add_ccvs(n1, n2, vs_ctrl_idx, value);
                    out.branch_types[out.num_branches++] = 'H';
                } else {
                    throw circuit_error("unknown branch type: " + type);
                }

                skip_ws(json, i);
                if (json[i] == ',') ++i;
                skip_ws(json, i);
            }
            expect_char(json, i, ']');

        } else {
            skip_value(json, i);
        }

        skip_ws(json, i);
        if (json[i] == ',') ++i;
        skip_ws(json, i);
    }
    expect_char(json, i, '}');

    if (node_count == 0) throw circuit_error("missing node_count field");
    return out;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

static std::string dbl_to_str(double v) {
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%.10g", v);
    return std::string(buf);
}

std::string result_to_json(const DcAnalysisResult& result, const ParsedCircuit& circuit) {
    std::string out;
    out.reserve(512);
    out += "{\"ok\":true,\"node_voltages\":[";
    for (std::size_t k = 0; k < result.num_nodes; ++k) {
        if (k != 0) out += ',';
        out += dbl_to_str(result.node_voltage[k]);
    }
    out += "],\"branch_currents\":[";

    int ri = 0, ci = 0, vi = 0, gi = 0, ei = 0, fi = 0, hi = 0;
    for (int b = 0; b < circuit.num_branches; ++b) {
        if (b != 0) out += ',';
        double current = 0.0;
        switch (circuit.branch_types[b]) {
            case 'R': current = result.resistor_current[ri++];       break;
            case 'V': current = result.voltage_source_current[vi++]; break;
            case 'I': current = result.current_source_current[ci++]; break;
            case 'G': current = result.vccs_current[gi++];           break;
            case 'E': current = result.vcvs_current[ei++];           break;
            case 'F': current = result.cccs_current[fi++];           break;
            case 'H': current = result.ccvs_current[hi++];           break;
            default: break;
        }
        out += dbl_to_str(current);
    }
    out += "]}";
    return out;
}

std::string error_to_json(const std::string& msg) {
    std::string safe;
    safe.reserve(msg.size());
    for (const char c : msg) {
        if      (c == '"')  safe += "\\\"";
        else if (c == '\\') safe += "\\\\";
        else                safe += c;
    }
    return "{\"ok\":false,\"error\":\"" + safe + "\"}";
}
