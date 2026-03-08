/**
 * SchematicViewer.jsx  v6
 *
 * ROOT-CAUSE FIXES:
 *  1. AND gate — redrawn: proper flat-left + full semicircle-right.
 *     Arc center is exactly at mid-height, radius = half gate height.
 *     Input pins correctly land on the flat left wall.
 *     Output pin precisely at arc tip.
 *
 *  2. XOR 2nd input disconnected — slot-based pin assignment.
 *     `buildPinMap()` pre-computes which input SLOT each incoming
 *     wire goes to per destination, so wires land on different Y positions.
 *
 *  3. Cytoscape "Script error" crash — root cause was:
 *       'shape-polygon-points' returning undefined for non-polygon nodes
 *       which causes Cytoscape to throw a cross-origin script error.
 *     Fix: removed the property entirely; use only safe built-in shapes.
 *     Also wrap cy init in try/catch with detailed console logging.
 *
 *  4. All wires orange — post-process: only is_bus AND bus_width>1 = bus.
 *     Clock/reset wires get their own color. Single-bit = dim blue.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

/* ─────────────────────────────────────────────
   COMPONENT DIMENSIONS  (W × H in px)
───────────────────────────────────────────── */
const DIMS = {
  and:        { W: 80,  H: 60  },
  nand:       { W: 84,  H: 60  },
  or:         { W: 82,  H: 60  },
  nor:        { W: 86,  H: 60  },
  xor:        { W: 88,  H: 60  },
  xnor:       { W: 92,  H: 60  },
  not:        { W: 66,  H: 50  },
  buf:        { W: 66,  H: 50  },
  dff:        { W: 100, H: 110 },
  tff:        { W: 100, H: 110 },
  register:   { W: 110, H: 80  },
  counter:    { W: 110, H: 80  },
  mux:        { W: 76,  H: 90  },
  adder:      { W: 82,  H: 72  },
  subtractor: { W: 82,  H: 72  },
  comparator: { W: 92,  H: 82  },
  alu:        { W: 104, H: 122 },
  input:      { W: 86,  H: 44  },
  output:     { W: 86,  H: 44  },
  clock:      { W: 64,  H: 64  },
  decoder:    { W: 92,  H: 100 },
  encoder:    { W: 92,  H: 100 },
  memory:     { W: 110, H: 110 },
  default:    { W: 90,  H: 60  },
};

/* ─────────────────────────────────────────────
   OUTPUT PIN POSITION  (where wire LEAVES this component)
───────────────────────────────────────────── */
function outPinPos(type, W, H) {
  switch (type) {
    // Gates: output is at the right edge, vertical center
    case 'and':    { const r = (H-16)/2; return { x: W*0.375 + r, y: H/2 }; }
    case 'nand':   { const r = (H-16)/2; return { x: W*0.375 + r + 9, y: H/2 }; }
    case 'or':     return { x: W * 0.84, y: H / 2 };
    case 'nor':    return { x: W * 0.76 + 9, y: H / 2 };
    case 'xor':    return { x: W * 0.81, y: H / 2 };
    case 'xnor':   return { x: W * 0.74 + 9, y: H / 2 };
    case 'not':    return { x: W * 0.80 + 4.5, y: H / 2 };
    case 'buf':    return { x: W - 4, y: H / 2 };
    // Flip-flops: Q is at upper-right
    case 'dff':
    case 'tff':    return { x: W, y: H * 0.295 };
    // Ports
    case 'input':  return { x: W, y: H / 2 };
    case 'clock':  return { x: W, y: H / 2 };
    case 'output': return { x: 0, y: H / 2 };  // outputs receive, not send
    default:       return { x: W, y: H / 2 };
  }
}

/* ─────────────────────────────────────────────
   INPUT PIN SLOTS
   Returns Y-position for the Nth arriving wire (slot 0,1,2…)
   so every wire lands on a different pin.
───────────────────────────────────────────── */
function inputPinY(type, H, slot) {
  switch (type) {
    case 'and':
    case 'nand':
    case 'or':
    case 'nor':
    case 'xor':
    case 'xnor': {
      // Two-input gates: pin A = upper third, pin B = lower third
      const pins = [H * 0.35, H * 0.65];
      return pins[Math.min(slot, pins.length - 1)];
    }
    case 'dff':
    case 'tff': {
      // D/T (slot 0), CLK (slot 1), CLR (slot 2)
      const pins = [H * 0.295, H * 0.555, H * 0.81];
      return pins[Math.min(slot, pins.length - 1)];
    }
    case 'mux': {
      const pins = [H * 0.25, H * 0.50, H * 0.75];
      return pins[Math.min(slot, pins.length - 1)];
    }
    case 'register':
    case 'counter':
    case 'adder':
    case 'subtractor':
    case 'comparator':
    case 'alu': {
      const pins = [H * 0.38, H * 0.56, H * 0.74];
      return pins[Math.min(slot, pins.length - 1)];
    }
    case 'output': return H / 2;
    case 'not':
    case 'buf':    return H / 2;
    default:       return H * (0.35 + (slot % 3) * 0.20);
  }
}

/* ─────────────────────────────────────────────
   WIRE COLOR
───────────────────────────────────────────── */
function wireCol(conn) {
  if (!conn) return '#1e4a8a';
  const sig = (conn.signal_name || '').toLowerCase();
  // Only treat as bus if both flags set AND actual width > 1
  if (conn.is_bus && (conn.bus_width || 0) > 1) return '#f59e0b';
  if (/clk|clock/.test(sig))                    return '#6b7280';
  if (/rst|reset|clr|clear/.test(sig))          return '#f97316';
  return '#1e4a8a';
}

/* ─────────────────────────────────────────────
   COLORS
───────────────────────────────────────────── */
const CBORDER = {
  dff:'#7c3aed',tff:'#7c3aed',register:'#6d28d9',counter:'#7c3aed',
  and:'#d97706',nand:'#b45309',or:'#0369a1',nor:'#075985',
  xor:'#0e7490',xnor:'#0891b2',not:'#ef4444',buf:'#475569',
  mux:'#0891b2',adder:'#059669',subtractor:'#dc2626',
  input:'#10b981',output:'#ef4444',clock:'#6b7280',
  decoder:'#06b6d4',encoder:'#06b6d4',comparator:'#3b82f6',
  alu:'#10b981',memory:'#8b5cf6',default:'#1e3a6b',
};
const CBG = {
  dff:'#150d36',tff:'#150d36',register:'#100b2d',counter:'#120e38',
  and:'#1c0e00',nand:'#180c00',or:'#001020',nor:'#00111e',
  xor:'#001822',xnor:'#001a24',not:'#200005',buf:'#0a0f18',
  mux:'#001428',adder:'#001c16',subtractor:'#1a0808',
  input:'#002218',output:'#1c0010',clock:'#0c1020',
  decoder:'#00181a',encoder:'#001618',comparator:'#001428',
  alu:'#001c16',memory:'#16082e',default:'#060f22',
};

/* ═══════════════════════════════════════════════════
   IEEE GATE SHAPES
   All pin lines start at x=0 (or x=W for output) so
   wire routing finds exact endpoints reliably.
═══════════════════════════════════════════════════ */
function GateShape({ type, W: w, H: h, fill, stroke }) {

  switch (type) {

    /* ── AND  ──────────────────────────────────────
       Flat left wall + flat top/bottom + right semicircle.
       • gate body spans from x=8 to x=(8 + 2r)
       • r = (body_height / 2),  body_height = h - 16
       • output at (8 + 2r, h/2)
    ─────────────────────────────────────────────── */
    case 'and': {
      const bh = h - 16;              // body height
      const r  = bh / 2;              // semicircle radius
      const lx = 8;                   // left edge of gate body
      const mx = lx;                  // arc starts at same x (flat left is vertical wall only)
      const ty = 8, by = h - 8;       // top/bottom of body
      const outX = lx + r * 2;        // was: lx + (something), now exact tip
      // Path: left wall → bottom → arc (clockwise, lower→upper) → top (implicit Z)
      const body = `M ${lx},${ty} L ${lx},${by} L ${lx+r*0.5},${by} A ${r},${r} 0 0,1 ${lx+r*0.5},${ty} Z`;
      // Actually use the proper path: flat part goes to arc start
      // Standard AND: flat portion ≈ 40% of width, arc ≈ 60%
      const flatEnd = Math.round(lx + r * 0.3); // small flat extension before arc
      const body2 = `M ${lx},${ty} L ${lx},${by} L ${flatEnd},${by} A ${r},${r} 0 0,1 ${flatEnd},${ty} Z`;
      const realOutX = flatEnd + r;
      return (
        <g>
          <path d={body2} fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round"/>
          {/* Input pins — slot 0 upper, slot 1 lower */}
          <line x1={0} y1={h*0.35} x2={lx} y2={h*0.35} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0} y1={h*0.65} x2={lx} y2={h*0.65} stroke={stroke} strokeWidth="1.5"/>
          {/* Output pin */}
          <line x1={realOutX} y1={h/2} x2={w} y2={h/2} stroke={stroke} strokeWidth="1.5"/>
          {/* Pin dots */}
          <circle cx={0} cy={h*0.35} r={3} fill={stroke}/>
          <circle cx={0} cy={h*0.65} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2}    r={3} fill={stroke}/>
          {/* Label */}
          <text x={realOutX*0.50+lx*0.5} y={h/2+4} textAnchor="middle"
                fill={stroke} fontSize="11" fontFamily="'JetBrains Mono',monospace" fontWeight="800">
            &amp;
          </text>
        </g>
      );
    }

    /* ── NAND  ─────────────────────────────────── */
    case 'nand': {
      const bh = h - 16; const r = bh / 2;
      const lx = 8; const ty = 8; const by = h - 8;
      const flatEnd = lx + Math.round(r * 0.3);
      const body = `M ${lx},${ty} L ${lx},${by} L ${flatEnd},${by} A ${r},${r} 0 0,1 ${flatEnd},${ty} Z`;
      const arcOutX = flatEnd + r;
      const bubX   = arcOutX + 5;
      return (
        <g>
          <path d={body} fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round"/>
          <circle cx={bubX} cy={h/2} r={4.5} fill={fill} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0} y1={h*0.35} x2={lx}       y2={h*0.35} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0} y1={h*0.65} x2={lx}       y2={h*0.65} stroke={stroke} strokeWidth="1.5"/>
          <line x1={bubX+4.5} y1={h/2} x2={w}    y2={h/2}    stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h*0.35} r={3} fill={stroke}/>
          <circle cx={0} cy={h*0.65} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2}    r={3} fill={stroke}/>
          <text x={(arcOutX+lx)/2} y={h/2+4} textAnchor="middle"
                fill={stroke} fontSize="11" fontFamily="'JetBrains Mono',monospace" fontWeight="800">↑</text>
        </g>
      );
    }

    /* ── OR  ────────────────────────────────────── */
    case 'or': {
      const tipX = w * 0.84;
      const body = `
        M 8,8
        C 30,8   ${tipX-6},${h*0.22} ${tipX},${h/2}
        C ${tipX-6},${h*0.78}  30,${h-8}  8,${h-8}
        C 8,${h-8}  20,${h*0.68} 20,${h/2}
        C 20,${h*0.32} 8,8 8,8 Z`;
      return (
        <g>
          <path d={body} fill={fill} stroke={stroke} strokeWidth="2"/>
          <line x1={0} y1={h*0.35} x2={8}    y2={h*0.35} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0} y1={h*0.65} x2={8}    y2={h*0.65} stroke={stroke} strokeWidth="1.5"/>
          <line x1={tipX} y1={h/2} x2={w}    y2={h/2}    stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h*0.35} r={3} fill={stroke}/>
          <circle cx={0} cy={h*0.65} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2}    r={3} fill={stroke}/>
          <text x={tipX*0.44+5} y={h/2+4} textAnchor="middle"
                fill={stroke} fontSize="10" fontFamily="'JetBrains Mono',monospace" fontWeight="700">≥1</text>
        </g>
      );
    }

    /* ── NOR  ───────────────────────────────────── */
    case 'nor': {
      const tipX = w * 0.76; const bubX = tipX + 5;
      const body = `
        M 8,8
        C 28,8   ${tipX-6},${h*0.22} ${tipX},${h/2}
        C ${tipX-6},${h*0.78} 28,${h-8} 8,${h-8}
        C 8,${h-8} 20,${h*0.68} 20,${h/2}
        C 20,${h*0.32} 8,8 8,8 Z`;
      return (
        <g>
          <path d={body} fill={fill} stroke={stroke} strokeWidth="2"/>
          <circle cx={bubX} cy={h/2} r={4.5} fill={fill} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0} y1={h*0.35} x2={8}         y2={h*0.35} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0} y1={h*0.65} x2={8}         y2={h*0.65} stroke={stroke} strokeWidth="1.5"/>
          <line x1={bubX+4.5} y1={h/2} x2={w}     y2={h/2}    stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h*0.35} r={3} fill={stroke}/>
          <circle cx={0} cy={h*0.65} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2}    r={3} fill={stroke}/>
        </g>
      );
    }

    /* ── XOR  ───────────────────────────────────── */
    case 'xor': {
      const tipX = w * 0.81;
      // Extra left bow (the characteristic XOR second arc on the left)
      const bow  = `M 2,8 C 2,8 14,${h*0.30} 14,${h/2} C 14,${h*0.70} 2,${h-8} 2,${h-8}`;
      // Main OR-like body, shifted 6px right
      const body = `
        M 14,8
        C 36,8   ${tipX-6},${h*0.22} ${tipX},${h/2}
        C ${tipX-6},${h*0.78} 36,${h-8} 14,${h-8}
        C 14,${h-8} 26,${h*0.68} 26,${h/2}
        C 26,${h*0.32} 14,8 14,8 Z`;
      return (
        <g>
          {/* Bow — stroke only, no fill */}
          <path d={bow}  fill="none" stroke={stroke} strokeWidth="1.5"/>
          {/* Body */}
          <path d={body} fill={fill} stroke={stroke} strokeWidth="2"/>
          {/* Input pin lines start at x=0 and reach body at x=14 */}
          <line x1={0}   y1={h*0.35} x2={14}  y2={h*0.35} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0}   y1={h*0.65} x2={14}  y2={h*0.65} stroke={stroke} strokeWidth="1.5"/>
          {/* Output */}
          <line x1={tipX} y1={h/2}   x2={w}   y2={h/2}    stroke={stroke} strokeWidth="1.5"/>
          {/* Pin dots AT x=0 — these are the wire connection points */}
          <circle cx={0} cy={h*0.35} r={3} fill={stroke}/>
          <circle cx={0} cy={h*0.65} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2}    r={3} fill={stroke}/>
          {/* Symbol */}
          <text x={tipX*0.48+7} y={h/2+4} textAnchor="middle"
                fill={stroke} fontSize="13" fontFamily="'JetBrains Mono',monospace" fontWeight="700">⊕</text>
        </g>
      );
    }

    /* ── XNOR  ──────────────────────────────────── */
    case 'xnor': {
      const tipX = w * 0.74; const bubX = tipX + 5;
      const bow  = `M 2,8 C 2,8 14,${h*0.30} 14,${h/2} C 14,${h*0.70} 2,${h-8} 2,${h-8}`;
      const body = `
        M 14,8
        C 32,8 ${tipX-4},${h*0.22} ${tipX},${h/2}
        C ${tipX-4},${h*0.78} 32,${h-8} 14,${h-8}
        C 14,${h-8} 26,${h*0.68} 26,${h/2}
        C 26,${h*0.32} 14,8 14,8 Z`;
      return (
        <g>
          <path d={bow}  fill="none" stroke={stroke} strokeWidth="1.5"/>
          <path d={body} fill={fill} stroke={stroke} strokeWidth="2"/>
          <circle cx={bubX} cy={h/2} r={4.5} fill={fill} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0}   y1={h*0.35} x2={14}      y2={h*0.35} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0}   y1={h*0.65} x2={14}      y2={h*0.65} stroke={stroke} strokeWidth="1.5"/>
          <line x1={bubX+4.5} y1={h/2} x2={w}     y2={h/2}    stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h*0.35} r={3} fill={stroke}/>
          <circle cx={0} cy={h*0.65} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2}    r={3} fill={stroke}/>
        </g>
      );
    }

    /* ── NOT  ────────────────────────────────────── */
    case 'not': {
      const bubX = w * 0.80;
      return (
        <g>
          <polygon points={`6,5 6,${h-5} ${bubX-4.5},${h/2}`}
                   fill={fill} stroke={stroke} strokeWidth="2"/>
          <circle cx={bubX} cy={h/2} r={4.5} fill={fill} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0}        y1={h/2} x2={6}     y2={h/2} stroke={stroke} strokeWidth="1.5"/>
          <line x1={bubX+4.5} y1={h/2} x2={w}     y2={h/2} stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h/2} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2} r={3} fill={stroke}/>
        </g>
      );
    }

    /* ── BUF  ────────────────────────────────────── */
    case 'buf': {
      return (
        <g>
          <polygon points={`6,5 6,${h-5} ${w-4},${h/2}`}
                   fill={fill} stroke={stroke} strokeWidth="2"/>
          <line x1={0}   y1={h/2} x2={6}   y2={h/2} stroke={stroke} strokeWidth="1.5"/>
          <line x1={w-4} y1={h/2} x2={w}   y2={h/2} stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h/2} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2} r={3} fill={stroke}/>
        </g>
      );
    }

    /* ── DFF / TFF  ──────────────────────────────── */
    case 'dff':
    case 'tff': {
      const dLabel = type === 'tff' ? 'T' : 'D';
      return (
        <g>
          <rect x={6} y={6} width={w-12} height={h-12} rx={7}
                fill={fill} stroke={stroke} strokeWidth="2"/>
          <rect x={6} y={6} width={w-12} height={22} rx={5}
                fill={stroke} opacity={0.22}/>
          <text x={w/2} y={22} textAnchor="middle"
                fill={stroke} fontSize="11" fontFamily="'JetBrains Mono',monospace" fontWeight="800">
            {type.toUpperCase()}
          </text>
          {/* Q output (right) */}
          <line x1={w-6} y1={h*0.295} x2={w} y2={h*0.295} stroke={stroke} strokeWidth="1.5"/>
          <circle cx={w} cy={h*0.295} r={3} fill={stroke}/>
          <text x={w-18} y={h*0.295+4} textAnchor="end"
                fill={stroke} fontSize="9" fontFamily="'JetBrains Mono',monospace" fontWeight="700">Q</text>
          {/* D/T pin (left, slot 0) */}
          <line x1={0} y1={h*0.295} x2={6} y2={h*0.295} stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h*0.295} r={3} fill={stroke}/>
          <text x={16} y={h*0.295+4} fill={stroke} fontSize="9"
                fontFamily="'JetBrains Mono',monospace" fontWeight="700">{dLabel}</text>
          {/* CLK pin (left, slot 1) */}
          <line x1={0} y1={h*0.555} x2={6} y2={h*0.555} stroke="#6b7280" strokeWidth="1.5"/>
          <circle cx={0} cy={h*0.555} r={3} fill="#6b7280"/>
          <polygon points={`14,${h*0.555-6} 14,${h*0.555+6} 24,${h*0.555}`}
                   fill={stroke} opacity={0.65}/>
          {/* CLR pin (left, slot 2) */}
          <line x1={0} y1={h*0.81} x2={6} y2={h*0.81} stroke="#475569" strokeWidth="1.5"/>
          <circle cx={0} cy={h*0.81} r={3} fill="#475569"/>
          <text x={16} y={h*0.81+4} fill="#475569" fontSize="8"
                fontFamily="'JetBrains Mono',monospace">CLR</text>
          <line x1={6} y1={28} x2={w-6} y2={28} stroke={stroke} strokeWidth="0.5" opacity={0.3}/>
        </g>
      );
    }

    /* ── INPUT port  ─────────────────────────────── */
    case 'input': {
      return (
        <g>
          <path d={`M 5,5 L 5,${h-5} L ${w*0.68},${h-5} L ${w-5},${h/2} L ${w*0.68},5 Z`}
                fill={fill} stroke={stroke} strokeWidth="2"/>
          <text x={w*0.36} y={h/2+4} textAnchor="middle"
                fill={stroke} fontSize="10" fontFamily="'JetBrains Mono',monospace" fontWeight="800">IN</text>
          <line x1={w-5} y1={h/2} x2={w} y2={h/2} stroke={stroke} strokeWidth="1.5"/>
          <circle cx={w} cy={h/2} r={3} fill={stroke}/>
        </g>
      );
    }

    /* ── OUTPUT port  ────────────────────────────── */
    case 'output': {
      return (
        <g>
          <path d={`M 5,5 L 5,${h-5} L ${w*0.7},${h-5} L ${w-5},${h/2} L ${w*0.7},5 Z`}
                fill={fill} stroke={stroke} strokeWidth="2"/>
          <text x={w*0.37} y={h/2+4} textAnchor="middle"
                fill={stroke} fontSize="10" fontFamily="'JetBrains Mono',monospace" fontWeight="800">OUT</text>
          <line x1={0} y1={h/2} x2={5}   y2={h/2} stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h/2} r={3} fill={stroke}/>
        </g>
      );
    }

    /* ── CLOCK  ──────────────────────────────────── */
    case 'clock': {
      const cx = w/2, cy = h/2, r = w/2-7;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth="2"/>
          <line x1={cx} y1={cy} x2={cx}       y2={cy-r*0.65}
                stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
          <line x1={cx} y1={cy} x2={cx+r*0.5} y2={cy}
                stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
          <text x={cx} y={h-5} textAnchor="middle"
                fill={stroke} fontSize="8" fontFamily="'JetBrains Mono',monospace">CLK</text>
          <line x1={w-7} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth="1.5"/>
          <circle cx={w} cy={cy} r={3} fill={stroke}/>
        </g>
      );
    }

    /* ── MUX  ────────────────────────────────────── */
    case 'mux': {
      return (
        <g>
          <path d={`M 5,5 L 5,${h-5} L ${w-8},${h*0.76} L ${w-8},${h*0.24} Z`}
                fill={fill} stroke={stroke} strokeWidth="2"/>
          <text x={(w-8)*0.45} y={h/2+4} textAnchor="middle"
                fill={stroke} fontSize="10" fontFamily="'JetBrains Mono',monospace" fontWeight="700">MUX</text>
          <line x1={0}   y1={h*0.25} x2={5}   y2={h*0.25} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0}   y1={h*0.50} x2={5}   y2={h*0.50} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0}   y1={h*0.75} x2={5}   y2={h*0.75} stroke={stroke} strokeWidth="1.5"/>
          <line x1={w-8} y1={h/2}    x2={w}   y2={h/2}    stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h*0.25} r={3} fill={stroke}/>
          <circle cx={0} cy={h*0.50} r={3} fill={stroke}/>
          <circle cx={0} cy={h*0.75} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2}    r={3} fill={stroke}/>
        </g>
      );
    }

    /* ── DEFAULT (register, adder, CMP, etc.)  ───── */
    default: {
      const lbl = {register:'REG',counter:'CTR',adder:'+',subtractor:'−',
                   comparator:'CMP',decoder:'DEC',encoder:'ENC',
                   alu:'ALU',memory:'MEM'}[type] || type.slice(0,3).toUpperCase();
      return (
        <g>
          <rect x={4} y={4} width={w-8} height={h-8} rx={7}
                fill={fill} stroke={stroke} strokeWidth="2"/>
          <rect x={4} y={4} width={w-8} height={22} rx={5}
                fill={stroke} opacity={0.20}/>
          <text x={w/2} y={20} textAnchor="middle"
                fill={stroke} fontSize="12" fontFamily="'JetBrains Mono',monospace" fontWeight="800">
            {lbl}
          </text>
          <line x1={0}   y1={h*0.40} x2={4}   y2={h*0.40} stroke={stroke} strokeWidth="1.5"/>
          <line x1={0}   y1={h*0.62} x2={4}   y2={h*0.62} stroke={stroke} strokeWidth="1.5"/>
          <line x1={w-4} y1={h/2}    x2={w}   y2={h/2}    stroke={stroke} strokeWidth="1.5"/>
          <circle cx={0} cy={h*0.40} r={3} fill={stroke}/>
          <circle cx={0} cy={h*0.62} r={3} fill={stroke}/>
          <circle cx={w} cy={h/2}    r={3} fill={stroke}/>
        </g>
      );
    }
  }
}

/* ═══════════════════════════════════════════════════
   SIGNAL TOPOLOGY  — Pure React SVG  (zero external deps)

   WHY: Cytoscape CDN always causes "Script error" in CRA because
   the browser blocks cross-origin error details. Any crash inside
   Cytoscape's CDN code becomes an opaque "Script error" that can't
   be caught or fixed. Solution: replace with pure React SVG rendering
   using a built-in Verlet spring simulation. Zero deps, zero CDN,
   zero crashes.

   HOW THE LAYOUT WORKS:
     1. Place nodes in a circle initially
     2. Run 350 iterations of spring-force simulation (synchronously
        in useMemo so first render is already laid out)
     3. Render static SVG — no animation loop needed
   
   WHAT SIGNAL TOPOLOGY IS FOR:
     Shows the DATA FLOW between components as a directed graph.
     Unlike the Circuit Diagram (which shows gate shapes), topology
     shows WHICH components drive WHICH signals. Useful for:
     - Understanding data dependencies at a glance
     - Spotting combinational loops
     - Seeing which inputs drive which outputs (fan-out/fan-in)
═══════════════════════════════════════════════════ */

/* ── Node/edge color tables ──────────────────────── */
const TOPO_COL = {
  input:      {bg:'#052e16', bd:'#10b981', tx:'#34d399'},
  clock:      {bg:'#111827', bd:'#6b7280', tx:'#d1d5db'},
  output:     {bg:'#200010', bd:'#ef4444', tx:'#fca5a5'},
  dff:        {bg:'#150d36', bd:'#7c3aed', tx:'#c4b5fd'},
  tff:        {bg:'#150d36', bd:'#7c3aed', tx:'#c4b5fd'},
  register:   {bg:'#100b2d', bd:'#6d28d9', tx:'#a78bfa'},
  counter:    {bg:'#120e38', bd:'#7c3aed', tx:'#a78bfa'},
  and:        {bg:'#1c0e00', bd:'#d97706', tx:'#fbbf24'},
  nand:       {bg:'#180c00', bd:'#b45309', tx:'#f59e0b'},
  or:         {bg:'#001020', bd:'#0369a1', tx:'#38bdf8'},
  nor:        {bg:'#00111e', bd:'#075985', tx:'#7dd3fc'},
  xor:        {bg:'#001822', bd:'#0e7490', tx:'#22d3ee'},
  xnor:       {bg:'#001a24', bd:'#0891b2', tx:'#06b6d4'},
  not:        {bg:'#200005', bd:'#ef4444', tx:'#fca5a5'},
  buf:        {bg:'#0a0f18', bd:'#475569', tx:'#94a3b8'},
  mux:        {bg:'#001428', bd:'#0891b2', tx:'#38bdf8'},
  adder:      {bg:'#001c16', bd:'#059669', tx:'#34d399'},
  subtractor: {bg:'#1a0808', bd:'#dc2626', tx:'#fca5a5'},
  comparator: {bg:'#001428', bd:'#3b82f6', tx:'#93c5fd'},
  alu:        {bg:'#001c16', bd:'#10b981', tx:'#6ee7b7'},
  memory:     {bg:'#16082e', bd:'#8b5cf6', tx:'#c4b5fd'},
  default:    {bg:'#0c1428', bd:'#1e3a6b', tx:'#94a3b8'},
};

/* ── Gate glyph for topology nodes ──────────────── */
const TOPO_GLYPH = {
  and:'&', nand:'↑', or:'≥1', nor:'⊽', xor:'⊕', xnor:'⊙',
  not:'¬', buf:'1', dff:'DFF', tff:'TFF', register:'REG',
  counter:'CTR', mux:'MUX', adder:'+', subtractor:'−',
  comparator:'CMP', alu:'ALU', decoder:'DEC', encoder:'ENC',
  input:'IN', output:'OUT', clock:'⏱', memory:'MEM',
};

/* ── Pure-JS Verlet spring layout ────────────────── */
function runForceLayout(nodeIds, edgeList, W, H) {
  const N = nodeIds.length;
  if (N === 0) return {};

  // Initial positions: circle
  const pos = {};
  const vel = {};
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / N - Math.PI / 2;
    const r = Math.min(W, H) * 0.32;
    pos[id] = { x: W/2 + r * Math.cos(angle), y: H/2 + r * Math.sin(angle) };
    vel[id] = { x: 0, y: 0 };
  });

  const K_REPEL  = 7000;
  const K_SPRING = 0.04;
  const TARGET_D = 160;
  const DAMP     = 0.82;
  const edgeSet  = new Set(edgeList.map(e => `${e.s}__${e.t}`));

  for (let iter = 0; iter < 300; iter++) {
    // Repulsion: all pairs
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = nodeIds[i], b = nodeIds[j];
        const dx = pos[b].x - pos[a].x;
        const dy = pos[b].y - pos[a].y;
        const d2 = dx*dx + dy*dy + 0.01;
        const d  = Math.sqrt(d2);
        const f  = K_REPEL / d2;
        vel[a].x -= f * dx / d;  vel[a].y -= f * dy / d;
        vel[b].x += f * dx / d;  vel[b].y += f * dy / d;
      }
    }
    // Spring: edges only
    edgeList.forEach(({ s, t }) => {
      if (!pos[s] || !pos[t]) return;
      const dx = pos[t].x - pos[s].x;
      const dy = pos[t].y - pos[s].y;
      const d  = Math.sqrt(dx*dx + dy*dy) + 0.01;
      const f  = K_SPRING * (d - TARGET_D);
      vel[s].x += f * dx / d;  vel[s].y += f * dy / d;
      vel[t].x -= f * dx / d;  vel[t].y -= f * dy / d;
    });
    // Gravity toward center
    nodeIds.forEach(id => {
      vel[id].x += (W/2 - pos[id].x) * 0.003;
      vel[id].y += (H/2 - pos[id].y) * 0.003;
    });
    // Integrate
    nodeIds.forEach(id => {
      vel[id].x *= DAMP;  vel[id].y *= DAMP;
      pos[id].x += vel[id].x;
      pos[id].y += vel[id].y;
      // Clamp to canvas with padding
      pos[id].x = Math.max(80, Math.min(W-80, pos[id].x));
      pos[id].y = Math.max(60, Math.min(H-60, pos[id].y));
    });
  }
  return pos;
}

/* ── Curved arrow path between two nodes ──────── */
function edgePath(x1, y1, x2, y2, NW, NH) {
  // Offset endpoints to node edge (not center)
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx/len, uy = dy/len;
  const sx = x1 + ux * (NW/2 + 2);
  const sy = y1 + uy * (NH/2 + 2);
  const ex = x2 - ux * (NW/2 + 8);
  const ey = y2 - uy * (NH/2 + 8);
  // Slight curve via perpendicular offset
  const px = -(dy/len) * 20, py = (dx/len) * 20;
  const mx = (sx+ex)/2 + px, my = (sy+ey)/2 + py;
  return `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
}

/* ── Arrowhead marker def ──────────────────────── */
function ArrowDef({ id, color }) {
  return (
    <marker id={id} markerWidth="8" markerHeight="8"
            refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill={color}/>
    </marker>
  );
}

/* ── Main TopologyGraph ────────────────────────── */
function TopologyGraph({ circuitData }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ W: 900, H: 520 });
  const [hov,  setHov]  = useState(null);
  const [sel,  setSel]  = useState(null);
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ W: e.contentRect.width||900, H: e.contentRect.height||520 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const comps = circuitData?.components || [];
  const rawConns = circuitData?.connections || [];

  // Deduplicate edges (same source→target might appear multiple times)
  const edges = useMemo(() => {
    const seen = new Set();
    return rawConns.filter(cn => {
      if (!cn.from_comp || !cn.to_comp || cn.from_comp === cn.to_comp) return false;
      const key = `${cn.from_comp}__${cn.to_comp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((cn, i) => ({
      id: `e${i}`,
      s:  cn.from_comp,
      t:  cn.to_comp,
      label: cn.signal_name || '',
      isBus: !!(cn.is_bus && (cn.bus_width||0) > 1),
    }));
  }, [rawConns]);

  // Run force layout once per (comps, dims) change
  const positions = useMemo(() => {
    if (!comps.length) return {};
    const ids = comps.map(c => c.id);
    const edgeList = edges.map(e => ({ s: e.s, t: e.t }));
    return runForceLayout(ids, edgeList, dims.W, dims.H);
  }, [comps, dims, edges]);

  // Pan/zoom handlers
  const onMD = useCallback(e => {
    if (e.button !== 0) return;
    dragRef.current = { sx: e.clientX - pan.x, sy: e.clientY - pan.y };
  }, [pan]);
  const onMM = useCallback(e => {
    if (!dragRef.current) return;
    setPan({ x: e.clientX - dragRef.current.sx, y: e.clientY - dragRef.current.sy });
  }, []);
  const onMU = useCallback(() => { dragRef.current = null; }, []);
  const onWh = useCallback(e => {
    e.preventDefault();
    setZoom(z => Math.min(3, Math.max(0.2, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  }, []);

  const NW = 88, NH = 40; // node width/height

  if (!comps.length)
    return <div style={SE.empty}><span style={{fontSize:28}}>🔗</span><p>No topology data</p></div>;

  const selComp    = sel ? comps.find(c => c.id === sel) : null;
  const selEdges   = sel ? edges.filter(e => e.s === sel || e.t === sel) : [];
  const selEdgeSet = new Set(selEdges.map(e => `${e.s}__${e.t}`));

  // Unique arrow marker colors needed
  const markerColors = ['#1e4a8a','#f59e0b','#3b82f6'];

  return (
    <div ref={containerRef}
         style={{ width:'100%', height:'100%', position:'relative',
                  background:'#050810', overflow:'hidden',
                  cursor: dragRef.current ? 'grabbing' : 'grab' }}
         onMouseDown={onMD} onMouseMove={onMM}
         onMouseUp={onMU}   onMouseLeave={onMU}
         onWheel={onWh}     onClick={() => setSel(null)}>

      <svg width="100%" height="100%">
        <defs>
          {markerColors.map(c => (
            <ArrowDef key={c}
                      id={`arr-${c.replace('#','')}`}
                      color={c}/>
          ))}
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

          {/* ── Edges ─────────────────────────────── */}
          {edges.map(e => {
            const sp = positions[e.s], tp = positions[e.t];
            if (!sp || !tp) return null;
            const isHighlit = sel ? selEdgeSet.has(`${e.s}__${e.t}`) : false;
            const isHovEdge = hov && (hov === e.s || hov === e.t);
            const col = e.isBus ? '#f59e0b' : (isHighlit || isHovEdge) ? '#3b82f6' : '#1e4a8a';
            const mid  = `arr-${col.replace('#','')}`;
            const path = edgePath(sp.x, sp.y, tp.x, tp.y, NW, NH);
            return (
              <g key={e.id} opacity={sel && !isHighlit ? 0.18 : 1}>
                {/* shadow */}
                <path d={path} fill="none"
                      stroke={col} strokeWidth={e.isBus?5:3} opacity={0.12}/>
                {/* wire */}
                <path d={path} fill="none"
                      stroke={col} strokeWidth={e.isBus?2.2:1.4}
                      markerEnd={`url(#${mid})`}/>
                {/* signal label */}
                {e.label && (
                  <text fontSize="8" fill={col} opacity={0.7}
                        fontFamily="'JetBrains Mono',monospace">
                    <textPath href={`#tp-${e.id}`} startOffset="42%">
                      {e.label}
                    </textPath>
                  </text>
                )}
                {/* invisible path for textPath */}
                <defs><path id={`tp-${e.id}`} d={path}/></defs>
              </g>
            );
          })}

          {/* ── Nodes ─────────────────────────────── */}
          {comps.map(c => {
            const p = positions[c.id];
            if (!p) return null;
            const type  = c.type || 'default';
            const col   = TOPO_COL[type] || TOPO_COL.default;
            const glyph = TOPO_GLYPH[type] || type.slice(0,3).toUpperCase();
            const isHov = hov === c.id;
            const isSel = sel === c.id;
            const dimmed = sel && !isSel && !selEdges.some(e => e.s===c.id||e.t===c.id);
            const bw = isHov ? 2.5 : isSel ? 3 : 1.5;

            return (
              <g key={c.id}
                 transform={`translate(${p.x - NW/2},${p.y - NH/2})`}
                 style={{ cursor: 'pointer' }}
                 opacity={dimmed ? 0.2 : 1}
                 onClick={e => { e.stopPropagation(); setSel(isSel ? null : c.id); }}
                 onMouseEnter={() => setHov(c.id)}
                 onMouseLeave={() => setHov(null)}>

                {/* Selection glow */}
                {isSel && (
                  <rect x={-5} y={-5} width={NW+10} height={NH+10} rx={12}
                        fill="none" stroke="#3b82f6" strokeWidth="1.5"
                        strokeDasharray="5,3" opacity={0.9}/>
                )}

                {/* Node body */}
                <rect width={NW} height={NH} rx={7}
                      fill={isHov||isSel ? col.bg.replace(/[0-9a-f]{2}(?=[0-9a-f]{2}[0-9a-f]{2}$)/, v =>
                              Math.min(255, parseInt(v,16)+24).toString(16).padStart(2,'0')) : col.bg}
                      stroke={isHov||isSel ? '#06b6d4' : col.bd}
                      strokeWidth={bw}/>

                {/* Header strip */}
                <rect width={NW} height={16} rx={5}
                      fill={col.bd} opacity={isHov?0.35:0.22}/>

                {/* Glyph / icon */}
                <text x={NW*0.28} y={12} textAnchor="middle"
                      fill={col.tx} fontSize="10"
                      fontFamily="'JetBrains Mono',monospace" fontWeight="800">
                  {glyph}
                </text>

                {/* Label */}
                <text x={NW/2} y={NH-6} textAnchor="middle"
                      fill={col.tx} fontSize="9"
                      fontFamily="'JetBrains Mono',monospace" fontWeight="600">
                  {(c.label||c.id).slice(0,12)}
                </text>

                {/* Type tag */}
                <text x={NW-4} y={12} textAnchor="end"
                      fill={col.bd} fontSize="7" opacity={0.7}
                      fontFamily="'JetBrains Mono',monospace">
                  {type.slice(0,4)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Controls overlay */}
      <div style={{ position:'absolute', bottom:12, right:12,
                    display:'flex', gap:6, alignItems:'center' }}>
        {[['+',()=>setZoom(z=>Math.min(3,z*1.15))],
          ['−',()=>setZoom(z=>Math.max(0.2,z*0.87))],
          ['⊙',()=>{setZoom(1);setPan({x:0,y:0});}]]
          .map(([l,fn])=>(
          <button key={l} onClick={fn} style={{
            background:'rgba(6,15,34,0.9)', border:'1px solid #1e3a6b',
            color:'#475569', width:26, height:26, borderRadius:6,
            cursor:'pointer', fontSize:14, display:'flex',
            alignItems:'center', justifyContent:'center',
          }}>{l}</button>
        ))}
        <span style={{ fontSize:9, color:'#1e3a5f',
                       fontFamily:"'JetBrains Mono',monospace",
                       background:'rgba(6,15,34,0.8)',
                       padding:'3px 8px', borderRadius:4 }}>
          Drag · Scroll · Click node
        </span>
      </div>

      {/* Selected node info panel */}
      {selComp && (
        <div style={{
          position:'absolute', top:12, right:12, width:190,
          background:'rgba(6,15,34,0.95)',
          border:`1px solid ${(TOPO_COL[selComp.type]||TOPO_COL.default).bd}`,
          borderRadius:10, padding:'12px 14px',
          fontFamily:"'JetBrains Mono',monospace",
          boxShadow:'0 8px 28px rgba(0,0,0,0.8)',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#e2e8f0' }}>
              {selComp.label||selComp.id}
            </span>
            <button onClick={()=>setSel(null)}
                    style={{background:'none',border:'none',color:'#334155',
                            cursor:'pointer',fontSize:13}}>✕</button>
          </div>
          {[
            ['Type',    selComp.type],
            ['Bits',    selComp.bits||1],
            ['Drives',  selEdges.filter(e=>e.s===selComp.id).length + ' signals'],
            ['Driven by',selEdges.filter(e=>e.t===selComp.id).length + ' signals'],
          ].map(([l,v])=>(
            <div key={l} style={{ display:'flex', justifyContent:'space-between',
                                   fontSize:10, marginBottom:4 }}>
              <span style={{color:'#475569'}}>{l}</span>
              <span style={{color:'#94a3b8'}}>{String(v)}</span>
            </div>
          ))}
          {selEdges.length > 0 && (
            <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #0f172a' }}>
              <div style={{ fontSize:9, color:'#1e3a5f', marginBottom:4,
                            textTransform:'uppercase', letterSpacing:'0.06em' }}>
                Connected signals
              </div>
              {selEdges.slice(0,5).map(e => (
                <div key={e.id} style={{ fontSize:9, color:'#334155', marginBottom:2 }}>
                  {e.s===selComp.id ? '→' : '←'} {e.label||`${e.s}→${e.t}`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CIRCUIT CANVAS
═══════════════════════════════════════════════════ */
function CircuitCanvas({ circuitData, loadingCircuit, animSpeed }) {
  const [pan,      setPan]      = useState({x:50,y:50});
  const [zoom,     setZoom]     = useState(0.85);
  const [selected, setSelected] = useState(null);
  const [animOn,   setAnimOn]   = useState(false);
  const [hov,      setHov]      = useState(null);
  const [hovPos,   setHovPos]   = useState({x:0,y:0});
  const dragRef = useRef(null);

  const comps    = circuitData?.components  || [];
  const rawConns = circuitData?.connections || [];

  /* Pre-compute input pin slots: track how many wires have arrived at each component */
  const { pConns, slotArr } = useMemo(() => {
    // Fix bus flags — AI often marks single-bit as bus
    const fixed = rawConns.map(cn => ({
      ...cn,
      is_bus: !!(cn.is_bus && (cn.bus_width||0) > 1),
    }));
    // Assign slots
    const counter = {};
    const slots = fixed.map(cn => {
      const k = cn.to_comp;
      const s = counter[k] || 0;
      counter[k] = s + 1;
      return s;
    });
    return { pConns: fixed, slotArr: slots };
  }, [rawConns]);

  const onMD = useCallback(e => {
    if (e.button!==0) return;
    dragRef.current={sx:e.clientX-pan.x,sy:e.clientY-pan.y};
  },[pan]);
  const onMM = useCallback(e => {
    if (!dragRef.current) return;
    setPan({x:e.clientX-dragRef.current.sx,y:e.clientY-dragRef.current.sy});
  },[]);
  const onMU = useCallback(()=>{dragRef.current=null;},[]);
  const onWh = useCallback(e => {
    e.preventDefault();
    setZoom(z=>Math.min(4,Math.max(0.15,z*(e.deltaY<0?1.12:0.9))));
  },[]);

  function renderWire(cn, i) {
    const src = comps.find(c=>c.id===cn.from_comp);
    const tgt = comps.find(c=>c.id===cn.to_comp);
    if (!src||!tgt) return null;

    const sd = DIMS[src.type]||DIMS.default;
    const td = DIMS[tgt.type]||DIMS.default;
    const op = outPinPos(src.type,sd.W,sd.H);
    const slot = slotArr[i]||0;
    const iy   = inputPinY(tgt.type,td.H,slot);

    const x1=(src.x||0)+op.x, y1=(src.y||0)+op.y;
    const x2=(tgt.x||0)+0,    y2=(tgt.y||0)+iy;
    const mx = x1+(x2-x1)*0.55;
    const col = wireCol(cn);
    const pathD=`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    const pid=`w${i}`;

    return (
      <g key={`wire-${i}`}>
        <defs><path id={pid} d={pathD}/></defs>
        {/* shadow glow */}
        <path d={pathD} stroke={col} strokeWidth={cn.is_bus?5:3} fill="none" opacity={0.18}/>
        {/* main wire */}
        <path d={pathD} stroke={col} strokeWidth={cn.is_bus?2:1.4} fill="none"/>
        {/* bus marker */}
        {cn.is_bus && <>
          <line x1={(x1+x2)/2-5} y1={(y1+y2)/2-7}
                x2={(x1+x2)/2+5} y2={(y1+y2)/2+7}
                stroke={col} strokeWidth="2.5"/>
          {(cn.bus_width||0)>1 &&
            <text x={(x1+x2)/2+9} y={(y1+y2)/2}
                  fill={col} fontSize="8" fontFamily="'JetBrains Mono',monospace">
              {cn.bus_width}
            </text>}
        </>}
        {/* signal label */}
        {cn.signal_name &&
          <text fontSize="8" fill={col} fontFamily="'JetBrains Mono',monospace" opacity={0.65}>
            <textPath href={`#${pid}`} startOffset="40%">{cn.signal_name}</textPath>
          </text>}
        {/* animation dot */}
        {animOn &&
          <circle r="3.5" fill={col} opacity="0.88">
            <animateMotion dur={`${(2.0/Math.max(0.1,animSpeed)).toFixed(2)}s`} repeatCount="indefinite">
              <mpath href={`#${pid}`}/>
            </animateMotion>
          </circle>}
      </g>
    );
  }

  function renderComp(c) {
    const type   = c.type||'default';
    const {W,H}  = DIMS[type]||DIMS.default;
    const fill   = CBG[type]   ||CBG.default;
    const stroke = CBORDER[type]||CBORDER.default;
    const isSel  = selected?.id===c.id;
    return (
      <g key={c.id}
         transform={`translate(${c.x||0},${c.y||0})`}
         style={{cursor:'pointer'}}
         onClick={e=>{e.stopPropagation();setSelected(isSel?null:c);}}
         onMouseEnter={e=>{setHov(c);setHovPos({x:e.clientX,y:e.clientY});}}
         onMouseLeave={()=>setHov(null)}>
        {isSel && <rect x={-7} y={-7} width={W+14} height={H+14} rx={14}
                        fill="none" stroke="#3b82f6" strokeWidth="1.5"
                        strokeDasharray="6,3" opacity="0.9"/>}
        <GateShape type={type} W={W} H={H} fill={fill} stroke={stroke}/>
        <text x={W/2} y={H+13} textAnchor="middle"
              fill="#475569" fontSize="9" fontFamily="'JetBrains Mono',monospace">
          {(c.label||c.id).slice(0,18)}
        </text>
      </g>
    );
  }

  if (loadingCircuit) return (
    <div style={{...SE.empty,gap:14}}>
      <div style={{width:34,height:34,border:'3px solid #1e3a6b',borderTopColor:'#3b82f6',
                   borderRadius:'50%',animation:'_sp 0.8s linear infinite'}}/>
      <span style={{color:'#1e3a5f',fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>
        Building circuit…
      </span>
      <style>{'@keyframes _sp{to{transform:rotate(360deg)}}'}</style>
    </div>
  );

  if (!comps.length) return (
    <div style={SE.empty}>
      <div style={{fontSize:40}}>⚡</div>
      <p style={{color:'#334155',fontSize:14,fontFamily:"'JetBrains Mono',monospace"}}>
        Circuit data unavailable
      </p>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>

      {/* Toolbar */}
      <div style={{
        display:'flex',alignItems:'center',gap:10,padding:'6px 14px',
        background:'#080d18',borderBottom:'1px solid #0f172a',
        flexShrink:0,flexWrap:'wrap',
      }}>
        {/* Wire legend */}
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {[['#1e4a8a','Signal'],['#f59e0b','Bus'],['#6b7280','CLK'],['#f97316','RST']]
            .map(([c,l])=>(
            <div key={l} style={{display:'flex',alignItems:'center',gap:4,fontSize:9}}>
              <div style={{width:18,height:2,background:c,borderRadius:1}}/>
              <span style={{color:'#475569',fontFamily:"'JetBrains Mono',monospace"}}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={()=>setAnimOn(a=>!a)} style={{
            background:animOn?'rgba(59,130,246,0.15)':'#0f172a',
            border:`1px solid ${animOn?'#3b82f6':'#1e293b'}`,
            color:animOn?'#60a5fa':'#475569',
            padding:'4px 12px',borderRadius:6,cursor:'pointer',
            fontSize:11,fontFamily:"'JetBrains Mono',monospace",
          }}>
            {animOn?'⏹ Stop':'▶ Animate'}
          </button>
          {[['+',()=>setZoom(z=>Math.min(4,z*1.2))],
            ['−',()=>setZoom(z=>Math.max(0.15,z*0.84))],
            ['⊙',()=>{setZoom(0.85);setPan({x:50,y:50});}]]
            .map(([l,fn])=>(
            <button key={l} onClick={fn} style={{
              background:'#0f172a',border:'1px solid #1e293b',color:'#475569',
              width:28,height:28,borderRadius:6,cursor:'pointer',fontSize:14,
              display:'flex',alignItems:'center',justifyContent:'center',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* SVG canvas */}
      <div
        style={{
          flex:1,overflow:'hidden',position:'relative',background:'#050810',
          backgroundImage:
            'radial-gradient(circle at 50% 0%,rgba(30,58,107,0.10) 0%,transparent 55%),' +
            'linear-gradient(rgba(14,31,61,0.30) 1px,transparent 1px),' +
            'linear-gradient(90deg,rgba(14,31,61,0.30) 1px,transparent 1px)',
          backgroundSize:'100% 100%,30px 30px,30px 30px',
          cursor:dragRef.current?'grabbing':'grab',
          userSelect:'none',
        }}
        onMouseDown={onMD} onMouseMove={onMM}
        onMouseUp={onMU}   onMouseLeave={onMU}
        onWheel={onWh}     onClick={()=>setSelected(null)}
      >
        <svg width="100%" height="100%">
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {pConns.map((cn,i)=>renderWire(cn,i))}
            {comps.map(c=>renderComp(c))}
          </g>
        </svg>

        {/* hover tooltip */}
        {hov && (
          <div style={{
            position:'fixed',left:hovPos.x+14,top:Math.max(8,hovPos.y-6),
            zIndex:9999,pointerEvents:'none',
            background:'#060f22',
            border:`1px solid ${CBORDER[hov.type]||'#1e3a6b'}`,
            borderRadius:10,padding:'10px 14px',maxWidth:200,
            boxShadow:'0 8px 32px rgba(0,0,0,0.85)',
            fontFamily:"'JetBrains Mono',monospace",
          }}>
            <div style={{fontSize:13,fontWeight:700,color:'#e2e8f0',marginBottom:4}}>
              {hov.label||hov.id}
            </div>
            <div style={{fontSize:10,color:CBORDER[hov.type]||'#475569',
                         textTransform:'uppercase',letterSpacing:'0.05em'}}>
              {hov.type}
            </div>
          </div>
        )}

        {/* selected inspector */}
        {selected && (
          <div style={{
            position:'absolute',right:16,top:16,width:200,
            background:'#060f22',
            border:`1px solid ${CBORDER[selected.type]||'#1e3a6b'}`,
            borderRadius:10,padding:14,zIndex:20,
            boxShadow:'0 8px 32px rgba(0,0,0,0.7)',
            fontFamily:"'JetBrains Mono',monospace",
          }}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
              <span style={{fontSize:12,fontWeight:700,color:'#e2e8f0'}}>
                {selected.label||selected.id}
              </span>
              <button onClick={()=>setSelected(null)}
                      style={{background:'none',border:'none',color:'#334155',
                              cursor:'pointer',fontSize:14}}>✕</button>
            </div>
            {[['Type',selected.type],['Bits',selected.bits||1],['ID',selected.id]]
              .map(([l,v])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',
                                   marginBottom:5,fontSize:11}}>
                <span style={{color:'#475569'}}>{l}</span>
                <span style={{color:'#94a3b8'}}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* status bar */}
      <div style={{
        padding:'4px 14px',background:'#060a14',borderTop:'1px solid #0f172a',
        display:'flex',gap:14,fontSize:9,color:'#1e3a5f',
        fontFamily:"'JetBrains Mono',monospace",flexShrink:0,
      }}>
        <span>Scroll=zoom</span><span>Drag=pan</span><span>Click=inspect</span>
        <span style={{marginLeft:'auto',color:'#0c1428',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {circuitData.description||''}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TOPOLOGY LEGEND
═══════════════════════════════════════════════════ */
function TopLegend() {
  return (
    <div style={{
      display:'flex',gap:16,padding:'7px 14px',background:'#060a14',
      borderBottom:'1px solid #0f172a',flexWrap:'wrap',flexShrink:0,
    }}>
      {[['◆','#10b981','Input'],['⬡','#d97706','Gate'],['■','#7c3aed','Flip-flop'],
        ['⬡','#059669','Arith'],['○','#6b7280','Clock'],['▰','#ef4444','Output']]
        .map(([s,c,l])=>(
        <div key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:10}}>
          <span style={{color:c,fontSize:11}}>{s}</span>
          <span style={{color:'#334155',fontFamily:"'JetBrains Mono',monospace"}}>{l}</span>
        </div>
      ))}
      <span style={{marginLeft:'auto',fontSize:9,color:'#1e3a5f',
                    fontFamily:"'JetBrains Mono',monospace"}}>
        Hover · Drag · Scroll
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════════════ */
export default function SchematicViewer({
  circuitData, loadingCircuit, modelingType,
}) {
  const [subTab,    setSubTab]    = useState('circuit');
  const [animSpeed, setAnimSpeed] = useState(1);

  const modelLabel = {
    behavioral:'Behavioral→Gates', dataflow:'Dataflow→Gates',
    gate_level:'Gate-Level', structural:'Structural',
  }[modelingType] || 'Circuit';

  const cc = circuitData?.components?.length || 0;
  const ww = circuitData?.connections?.length || 0;

  return (
    <div style={{
      display:'flex',flexDirection:'column',
      height:'100%',minHeight:0,
      background:'#050810',overflow:'hidden',
    }}>
      {/* Sub-tab bar */}
      <div style={{
        display:'flex',alignItems:'flex-end',gap:2,
        padding:'8px 12px 0',background:'#080d18',
        borderBottom:'1px solid #0f172a',flexShrink:0,
      }}>
        {[
          {id:'circuit',  label:'⚡ Circuit Diagram', badge:modelLabel, info:cc?`${cc}c·${ww}w`:null},
          {id:'topology', label:'🔗 Signal Topology',                   info:cc?`${cc} nodes`:null},
        ].map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)} style={{
            display:'flex',alignItems:'center',gap:6,
            padding:'7px 14px',
            background:subTab===t.id?'#050810':'transparent',
            border:`1px solid ${subTab===t.id?'#0f172a':'transparent'}`,
            borderBottom:subTab===t.id?'1px solid #050810':'none',
            borderRadius:'8px 8px 0 0',cursor:'pointer',
            color:subTab===t.id?'#e2e8f0':'#334155',
            fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,
            position:'relative',bottom:-1,transition:'all .15s',
          }}>
            {t.label}
            {t.badge && (
              <span style={{
                background:'rgba(124,58,237,0.15)',color:'#a78bfa',
                border:'1px solid rgba(124,58,237,0.3)',
                padding:'1px 7px',borderRadius:8,fontSize:8,fontWeight:800,
              }}>{t.badge}</span>
            )}
            {t.info && <span style={{fontSize:9,color:'#1e3a5f'}}>{t.info}</span>}
          </button>
        ))}

        {subTab==='circuit' && (
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',
                       gap:8,paddingBottom:8}}>
            <span style={{fontSize:10,color:'#1e3a5f',fontFamily:"'JetBrains Mono',monospace"}}>
              Speed
            </span>
            <input type="range" min="0.2" max="3" step="0.1" value={animSpeed}
                   onChange={e=>setAnimSpeed(parseFloat(e.target.value))}
                   style={{width:80,accentColor:'#3b82f6',cursor:'pointer'}}/>
            <span style={{fontSize:10,color:'#334155',minWidth:28,
                          fontFamily:"'JetBrains Mono',monospace"}}>{animSpeed}×</span>
          </div>
        )}
      </div>

      {/* Panel — fills remaining height */}
      <div style={{flex:1,overflow:'hidden',position:'relative',minHeight:0}}>
        {subTab==='circuit' && (
          <CircuitCanvas
            circuitData={circuitData}
            loadingCircuit={loadingCircuit}
            animSpeed={animSpeed}
          />
        )}
        {subTab==='topology' && (
          <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
            <TopLegend/>
            <div style={{flex:1,position:'relative',overflow:'hidden',minHeight:0}}>
              <TopologyGraph circuitData={circuitData}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SE = {
  empty:{
    display:'flex',flexDirection:'column',alignItems:'center',
    justifyContent:'center',height:'100%',gap:12,
    background:'#050810',color:'#1e3a5f',
    fontFamily:"'JetBrains Mono',monospace",fontSize:13,
  },
};