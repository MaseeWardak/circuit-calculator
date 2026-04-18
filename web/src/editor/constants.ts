export const GRID       = 40;   // pixels per grid unit
export const COMP_UNITS = 2;    // component spans 2 grid units (80 px)
export const COMP_PX    = COMP_UNITS * GRID; // 80 px

export const CANVAS_COLS = 20;
export const CANVAS_ROWS = 14;
export const CANVAS_W    = CANVAS_COLS * GRID; // 800
export const CANVAS_H    = CANVAS_ROWS * GRID; // 560

export const PIN_R = 5; // pin hit-circle radius (px)

/** One color per node ID (cycles if more than 8 nodes). Node 0 = GND = green. */
export const NODE_COLORS = [
  '#16a34a', // 0 — GND
  '#2563eb', // 1
  '#ea580c', // 2
  '#9333ea', // 3
  '#db2777', // 4
  '#0891b2', // 5
  '#ca8a04', // 6
  '#64748b', // 7
];
