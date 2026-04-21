/** Thévenin / Norton equivalent at the two port markers (Port A / Port B). */
export interface TheveninResult {
  V_th:   number;         // open-circuit voltage  V(a) − V(b)
  I_N:    number;         // short-circuit current, + = flows a→b through short
  R_th:   number | null;  // null = indeterminate
  portANode: number;
  portBNode: number;
  error?: string;         // human-readable note if only partial results
}
