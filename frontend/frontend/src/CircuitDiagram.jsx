/**
 * CircuitDiagram.jsx
 *
 * Production-grade SVG circuit diagram renderer.
 * Draws IEEE-standard electronic symbols:
 *   D/T Flip-Flops, AND/OR/NOT/NAND/NOR/XOR/XNOR gates,
 *   MUX, Adder/Subtractor, Register, Counter, Decoder,
 *   Comparator, ALU, Input/Output ports, Clock, Buffer
 *
 * Features:
 *  - Zoom & pan (scroll + drag)
 *  - Animated signal-flow dots (▶ Animate button)
 *  - Click component → inspect pins & connections
 *  - Bus width slash notation
 *  - Dot-grid background
 *  - Auto-fit on data change
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────
// Port positions relative to component top-left corner
// ─────────────────────────────────────────────────────────────
const PORT_POS = {
  dff:  { D: [0,25], CLK: [0,65], RST: [40,0], Q: [80,25], QB: [80,65] },
  tff:  { T: [0,25], CLK: [0,65], RST: [40,0], Q: [80,25], QB: [80,65] },
  and:  { A: [0,20], B: [0,40], Y: [70,30] },
  or:   { A: [0,20], B: [0,40], Y: [70,30] },
  xor:  { A: [0,20], B: [0,40], Y: [75,30] },
  xnor: { A: [0,20], B: [0,40], Y: [77,30] },
  not:  { A: [0,25], Y: [55,25] },
  nand: { A: [0,20], B: [0,40], Y: [74,30] },
  nor:  { A: [0,20], B: [0,40], Y: [73,30] },
  mux:  { A: [0,20], B: [0,55], SEL: [35,90], Y: [70,37] },
  adder:{ A: [0,20], B: [0,50], CIN: [35,70], SUM: [70,20], COUT: [70,50] },
  subtractor: { A: [0,20], B: [0,50], CIN: [35,70], SUM: [70,20], COUT: [70,50] },
  register:   { D: [0,35], CLK: [0,62], RST: [50,0], Q: [100,35] },
  counter:    { CLK: [0,30], RST: [50,0], EN: [0,60], Q: [100,40] },
  comparator: { A: [0,20], B: [0,60], EQ: [80,20], GT: [80,50], LT: [80,70] },
  decoder:    { IN: [0,50], EN: [40,0], Y0: [80,20], Y1: [80,50], Y2: [80,80] },
  alu:        { A: [0,30], B: [0,70], OP: [50,0], OUT: [100,50], COUT: [100,80] },
  input:      { OUT: [80,20] },
  output:     { IN:  [0,20] },
  clock:      { CLK: [60,30] },
  buffer:     { A: [0,25], Y: [50,25] },
};

function getPinPos(comp, pinName) {
  const ports = PORT_POS[comp.type] || {};
  const aliases = { RESET: 'RST', CLOCK: 'CLK', OUT: 'OUT', IN: 'IN' };
  const key = aliases[pinName] || pinName;
  const pin = ports[key] || Object.values(ports)[0] || [0, 0];
  return { x: comp.x + pin[0], y: comp.y + pin[1] };
}

// ─────────────────────────────────────────────────────────────
// Color palette per component type
// ─────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  dff:        { stroke: '#7c3aed', fill: '#1a0533', label: '#a78bfa', accent: '#c4b5fd' },
  tff:        { stroke: '#7c3aed', fill: '#1a0533', label: '#a78bfa', accent: '#c4b5fd' },
  and:        { stroke: '#b45309', fill: '#1c1000', label: '#fbbf24', accent: '#fde68a' },
  or:         { stroke: '#0e7490', fill: '#001a1f', label: '#22d3ee', accent: '#67e8f9' },
  xor:        { stroke: '#0369a1', fill: '#001828', label: '#38bdf8', accent: '#7dd3fc' },
  xnor:       { stroke: '#0369a1', fill: '#001828', label: '#38bdf8', accent: '#7dd3fc' },
  not:        { stroke: '#b91c1c', fill: '#1c0000', label: '#f87171', accent: '#fca5a5' },
  nand:       { stroke: '#c2410c', fill: '#1c0800', label: '#fb923c', accent: '#fed7aa' },
  nor:        { stroke: '#7e22ce', fill: '#150020', label: '#c084fc', accent: '#e9d5ff' },
  mux:        { stroke: '#047857', fill: '#00150c', label: '#34d399', accent: '#6ee7b7' },
  adder:      { stroke: '#4338ca', fill: '#080c28', label: '#818cf8', accent: '#c7d2fe' },
  subtractor: { stroke: '#4338ca', fill: '#080c28', label: '#818cf8', accent: '#c7d2fe' },
  comparator: { stroke: '#0f766e', fill: '#001a18', label: '#2dd4bf', accent: '#99f6e4' },
  register:   { stroke: '#6d28d9', fill: '#120025', label: '#a78bfa', accent: '#ddd6fe' },
  counter:    { stroke: '#6d28d9', fill: '#120025', label: '#a78bfa', accent: '#ddd6fe' },
  decoder:    { stroke: '#0c4a6e', fill: '#001020', label: '#38bdf8', accent: '#7dd3fc' },
  alu:        { stroke: '#be123c', fill: '#200010', label: '#fb7185', accent: '#fda4af' },
  input:      { stroke: '#065f46', fill: '#001a0e', label: '#4ade80', accent: '#86efac' },
  output:     { stroke: '#991b1b', fill: '#200000', label: '#f87171', accent: '#fca5a5' },
  clock:      { stroke: '#92400e', fill: '#1c1000', label: '#fbbf24', accent: '#fde68a' },
  buffer:     { stroke: '#374151', fill: '#0a0c10', label: '#9ca3af', accent: '#d1d5db' },
};

function C(type, selected) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.buffer;
  return { stroke: selected ? '#fff' : c.stroke, fill: c.fill, label: c.label, accent: c.accent };
}

// ─────────────────────────────────────────────────────────────
// Component Symbol Renderer
// ─────────────────────────────────────────────────────────────
function CompSymbol({ comp, selected, onSelect }) {
  const { id, type, label = '', bits = 1, x = 0, y = 0 } = comp;
  const c  = C(type, selected);
  const sw = selected ? 2.5 : 1.5;
  const f  = selected ? 'url(#glow)' : undefined;
  const h  = (e) => { e.stopPropagation(); onSelect(id); };

  const dot = (px, py, color) =>
    <circle cx={px} cy={py} r="3.5" fill={color} key={`${px}-${py}`} opacity="0.9" />;

  switch (type) {

    case 'dff':
    case 'tff': {
      const dLabel = type === 'dff' ? 'D' : 'T';
      return (
        <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
          <rect width="80" height="100" rx="3" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
          <rect width="80" height="18" rx="3" fill={c.stroke} opacity="0.25" />
          <text x="40" y="12" textAnchor="middle" fill={c.label} fontSize="11" fontWeight="700">{type === 'dff' ? 'D-FF' : 'T-FF'}</text>
          <text x="7"  y="30" fill={c.accent} fontSize="10">{dLabel}</text>
          <text x="62" y="30" fill={c.accent} fontSize="10">Q</text>
          <text x="59" y="70" fill={c.accent} fontSize="10">Q̄</text>
          <path d="M 3,59 L 14,65 L 3,71" fill="none" stroke={c.accent} strokeWidth="1.5" />
          <text x="30" y="14" fill="#ef4444" fontSize="9">RST</text>
          {bits > 1 && <rect x="20" y="40" width="40" height="16" rx="8" fill={c.stroke} opacity="0.25" />}
          {bits > 1 && <text x="40" y="52" textAnchor="middle" fill={c.label} fontSize="9">[{bits - 1}:0]</text>}
          <text x="40" y="92" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
          {dot(0,  25, c.stroke)}{dot(0,  65, c.stroke)}
          {dot(40, 0,  '#ef4444')}
          {dot(80, 25, '#10b981')}{dot(80, 65, '#10b981')}
        </g>
      );
    }

    case 'and': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 0,0 L 30,0 Q 70,0 70,30 Q 70,60 30,60 L 0,60 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="25" y="38" fill={c.label} fontSize="18" fontWeight="900">&amp;</text>
        <text x="35" y="73" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
        {dot(0, 20, c.stroke)}{dot(0, 40, c.stroke)}{dot(70, 30, '#10b981')}
        <text x="5" y="17" fill={c.accent} fontSize="9">A</text>
        <text x="5" y="37" fill={c.accent} fontSize="9">B</text>
      </g>
    );

    case 'or': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 5,0 Q 25,0 40,0 Q 70,0 70,30 Q 70,60 40,60 Q 25,60 5,60 Q 20,45 20,30 Q 20,15 5,0 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="30" y="37" fill={c.label} fontSize="13" fontWeight="700">≥1</text>
        <text x="35" y="73" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
        {dot(5, 20, c.stroke)}{dot(5, 40, c.stroke)}{dot(70, 30, '#10b981')}
      </g>
    );

    case 'xor': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 0,0 Q 15,15 15,30 Q 15,45 0,60" fill="none" stroke={c.stroke} strokeWidth={sw} />
        <path d="M 8,0 Q 28,0 43,0 Q 75,0 75,30 Q 75,60 43,60 Q 28,60 8,60 Q 23,45 23,30 Q 23,15 8,0 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="35" y="37" fill={c.label} fontSize="13" fontWeight="700">=1</text>
        <text x="37" y="73" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
        {dot(0, 20, c.stroke)}{dot(0, 40, c.stroke)}{dot(75, 30, '#10b981')}
      </g>
    );

    case 'xnor': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 0,0 Q 15,15 15,30 Q 15,45 0,60" fill="none" stroke={c.stroke} strokeWidth={sw} />
        <path d="M 8,0 Q 28,0 43,0 Q 72,0 72,30 Q 72,60 43,60 Q 28,60 8,60 Q 23,45 23,30 Q 23,15 8,0 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <circle cx="76" cy="30" r="5" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="33" y="37" fill={c.label} fontSize="12" fontWeight="700">=1</text>
        {dot(0, 20, c.stroke)}{dot(0, 40, c.stroke)}{dot(81, 30, '#10b981')}
      </g>
    );

    case 'not': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 0,0 L 44,25 L 0,50 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <circle cx="48" cy="25" r="5" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="25" y="62" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
        {dot(0, 25, c.stroke)}{dot(53, 25, '#10b981')}
      </g>
    );

    case 'nand': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 0,0 L 28,0 Q 65,0 65,30 Q 65,60 28,60 L 0,60 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <circle cx="69" cy="30" r="5" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="22" y="38" fill={c.label} fontSize="18" fontWeight="900">&amp;</text>
        <text x="36" y="73" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
        {dot(0, 20, c.stroke)}{dot(0, 40, c.stroke)}{dot(74, 30, '#10b981')}
      </g>
    );

    case 'nor': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 5,0 Q 22,0 36,0 Q 62,0 62,30 Q 62,60 36,60 Q 22,60 5,60 Q 18,45 18,30 Q 18,15 5,0 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <circle cx="67" cy="30" r="5" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="25" y="37" fill={c.label} fontSize="13" fontWeight="700">≥1</text>
        {dot(5, 20, c.stroke)}{dot(5, 40, c.stroke)}{dot(72, 30, '#10b981')}
      </g>
    );

    case 'mux': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 0,0 L 70,12 L 70,78 L 0,90 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="35" y="42" textAnchor="middle" fill={c.label} fontSize="12" fontWeight="700">MUX</text>
        <text x="35" y="56" textAnchor="middle" fill={c.accent} fontSize="9">2:1</text>
        <text x="35" y="103" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
        {dot(0, 20, c.stroke)}{dot(0, 55, c.stroke)}{dot(35, 90, '#f59e0b')}{dot(70, 37, '#10b981')}
        <text x="4"  y="17" fill={c.accent} fontSize="9">0</text>
        <text x="4"  y="52" fill={c.accent} fontSize="9">1</text>
        <text x="38" y="87" fill="#f59e0b" fontSize="9">S</text>
      </g>
    );

    case 'adder':
    case 'subtractor': {
      const sym = type === 'adder' ? '+' : '−';
      return (
        <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
          <rect width="70" height="70" rx="10" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
          <text x="35" y="42" textAnchor="middle" fill={c.label} fontSize="26" fontWeight="900">{sym}</text>
          <text x="35" y="84" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
          {dot(0, 20, c.stroke)}{dot(0, 50, c.stroke)}{dot(35, 70, '#f59e0b')}
          {dot(70, 20, '#10b981')}{dot(70, 50, '#ef4444')}
          <text x="4"  y="17" fill={c.accent} fontSize="9">A</text>
          <text x="4"  y="47" fill={c.accent} fontSize="9">B</text>
          <text x="55" y="17" fill={c.accent} fontSize="9">Σ</text>
          <text x="52" y="47" fill="#ef4444"  fontSize="9">Co</text>
        </g>
      );
    }

    case 'register':
    case 'counter': {
      const isCounter = type === 'counter';
      return (
        <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
          <rect width="100" height="80" rx="4" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
          <rect width="100" height="22" rx="4" fill={c.stroke} opacity="0.3" />
          <text x="50" y="15" textAnchor="middle" fill={c.label} fontSize="11" fontWeight="700">{isCounter ? 'CNTR' : 'REG'}</text>
          {bits > 1 && <text x="50" y="26" textAnchor="middle" fill={c.accent} fontSize="8">[{bits - 1}:0]</text>}
          <path d="M 3,55 L 13,62 L 3,68" fill="none" stroke={c.accent} strokeWidth="1.5" />
          <text x="5"  y="32" fill={c.accent} fontSize="9">D</text>
          <text x="86" y="32" fill={c.accent} fontSize="9">Q</text>
          <text x="50" y="72" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
          {dot(0, 35, c.stroke)}{dot(0, 62, c.stroke)}{dot(50, 0, '#ef4444')}{dot(100, 35, '#10b981')}
        </g>
      );
    }

    case 'comparator': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <rect width="80" height="80" rx="4" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="40" y="35" textAnchor="middle" fill={c.label} fontSize="11" fontWeight="700">CMP</text>
        <text x="40" y="50" textAnchor="middle" fill={c.accent} fontSize="10">A vs B</text>
        <text x="40" y="72" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
        {dot(0, 20, c.stroke)}{dot(0, 60, c.stroke)}
        {dot(80, 20, '#10b981')}{dot(80, 50, '#f59e0b')}{dot(80, 70, '#ef4444')}
      </g>
    );

    case 'decoder': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <rect width="80" height="100" rx="4" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <rect width="80" height="22"  rx="4" fill={c.stroke} opacity="0.3" />
        <text x="40" y="15" textAnchor="middle" fill={c.label} fontSize="11" fontWeight="700">DEC</text>
        <text x="40" y="90" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
        {dot(0, 50, c.stroke)}{dot(40, 0, '#f59e0b')}
        {dot(80, 30, '#10b981')}{dot(80, 55, '#10b981')}{dot(80, 80, '#10b981')}
        <text x="4"  y="47" fill={c.accent} fontSize="9">IN</text>
        <text x="62" y="27" fill={c.accent} fontSize="9">Y0</text>
        <text x="62" y="52" fill={c.accent} fontSize="9">Y1</text>
        <text x="62" y="77" fill={c.accent} fontSize="9">Y2</text>
      </g>
    );

    case 'alu': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 0,10 L 100,0 L 100,120 L 0,110 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="50" y="55" textAnchor="middle" fill={c.label} fontSize="14" fontWeight="700">ALU</text>
        <text x="50" y="72" textAnchor="middle" fill={c.accent} fontSize="9">{bits}-bit</text>
        {dot(0, 30, c.stroke)}{dot(0, 70, c.stroke)}{dot(50, 0, '#f59e0b')}
        {dot(100, 50, '#10b981')}{dot(100, 80, '#ef4444')}
      </g>
    );

    case 'input': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 0,0 L 58,0 L 80,20 L 58,40 L 0,40 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="30" y="22" textAnchor="middle" fill={c.label} fontSize="10" fontWeight="700">{label}</text>
        {bits > 1 && <text x="30" y="34" textAnchor="middle" fill={c.accent} fontSize="8">[{bits - 1}:0]</text>}
        {dot(80, 20, '#10b981')}
      </g>
    );

    case 'output': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 22,0 L 80,0 L 80,40 L 22,40 L 0,20 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="45" y="22" textAnchor="middle" fill={c.label} fontSize="10" fontWeight="700">{label}</text>
        {bits > 1 && <text x="45" y="34" textAnchor="middle" fill={c.accent} fontSize="8">[{bits - 1}:0]</text>}
        {dot(0, 20, c.stroke)}
      </g>
    );

    case 'clock': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <circle cx="30" cy="30" r="28" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <path d="M 12,30 L 19,30 L 19,14 L 28,14 L 28,46 L 37,46 L 37,30 L 44,30"
              fill="none" stroke={c.label} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <text x="30" y="66" textAnchor="middle" fill="#334155" fontSize="9">CLK</text>
        {dot(60, 30, '#10b981')}
      </g>
    );

    case 'buffer': return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <path d="M 0,0 L 50,25 L 0,50 Z" fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
        <text x="25" y="62" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
        {dot(0, 25, c.stroke)}{dot(50, 25, '#10b981')}
      </g>
    );

    default: return (
      <g transform={`translate(${x},${y})`} onClick={h} style={{ cursor: 'pointer' }} filter={f}>
        <rect width="80" height="60" rx="4" fill="#0a0c10" stroke="#334155" strokeWidth={sw} />
        <text x="40" y="34" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="700">
          {String(type).toUpperCase()}
        </text>
        <text x="40" y="75" textAnchor="middle" fill="#334155" fontSize="9">{label}</text>
      </g>
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Wire renderer (cubic bezier + animated electron dot)
// ─────────────────────────────────────────────────────────────
function WireComp({ conn, components, highlightedSet, animated }) {
  const fromComp = components.find(c => c.id === conn.from_comp);
  const toComp   = components.find(c => c.id === conn.to_comp);
  if (!fromComp || !toComp) return null;

  const from = getPinPos(fromComp, conn.from_pin || 'Y');
  const to   = getPinPos(toComp,   conn.to_pin   || 'A');

  const isBus  = conn.is_bus || (conn.bus_width > 1);
  const isHigh = highlightedSet?.has(conn.from_comp) || highlightedSet?.has(conn.to_comp);

  const strokeColor = isHigh ? '#a78bfa' : isBus ? '#f59e0b' : '#1e3a5f';
  const strokeWidth = isHigh ? 2.5       : isBus ? 2.5       : 1.5;

  const dx   = Math.abs(to.x - from.x) * 0.5;
  const path = `M ${from.x},${from.y} C ${from.x + dx},${from.y} ${to.x - dx},${to.y} ${to.x},${to.y}`;
  const pid  = `p-${conn.id}`;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  return (
    <g>
      <path d={path} fill="none" stroke="#000" strokeWidth={strokeWidth + 2} opacity="0.2" />
      <path id={pid} d={path} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
      {isBus && (
        <>
          <line x1={midX - 4} y1={midY + 6} x2={midX + 4} y2={midY - 6} stroke={strokeColor} strokeWidth="2" />
          <text x={midX + 7} y={midY - 3} fill="#f59e0b" fontSize="8" fontStyle="italic">{conn.bus_width}</text>
        </>
      )}
      {conn.signal_name && (
        <text fontSize="8" fill="#1e3a5f" textAnchor="middle">
          <textPath href={`#${pid}`} startOffset="35%">{conn.signal_name}</textPath>
        </text>
      )}
      {animated && (
        <circle r="4" fill={isBus ? '#f59e0b' : '#10b981'} opacity="0.9">
          <animateMotion dur={`${0.7 + Math.random() * 0.9}s`} repeatCount="indefinite" rotate="auto">
            <mpath href={`#${pid}`} />
          </animateMotion>
        </circle>
      )}
      <circle cx={from.x} cy={from.y} r="2.5" fill={strokeColor} opacity="0.7" />
      <circle cx={to.x}   cy={to.y}   r="2.5" fill={strokeColor} opacity="0.7" />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Main CircuitDiagram component
// ─────────────────────────────────────────────────────────────
export default function CircuitDiagram({ circuitData, loading }) {
  const [selected,    setSelected]    = useState(null);
  const [transform,   setTransform]   = useState({ x: 40, y: 40, scale: 1 });
  const [dragging,    setDragging]    = useState(false);
  const [dragOrigin,  setDragOrigin]  = useState({ x: 0, y: 0 });
  const [animated,    setAnimated]    = useState(false);
  const svgRef = useRef(null);

  // Auto-fit canvas when data arrives
  useEffect(() => {
    if (!circuitData?.canvas_width) return;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const { clientWidth: W, clientHeight: H } = svgEl;
    const cw    = circuitData.canvas_width;
    const ch    = circuitData.canvas_height;
    const scale = Math.min(W / cw, H / ch, 1.2) * 0.85;
    setTransform({ x: (W - cw * scale) / 2, y: (H - ch * scale) / 2, scale });
  }, [circuitData]);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragOrigin({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  }, [transform]);

  const onMouseMove = useCallback((e) => {
    if (!dragging) return;
    setTransform(t => ({ ...t, x: e.clientX - dragOrigin.x, y: e.clientY - dragOrigin.y }));
  }, [dragging, dragOrigin]);

  const onMouseUp   = useCallback(() => setDragging(false), []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 0.9;
    setTransform(t => ({ ...t, scale: Math.min(4, Math.max(0.15, t.scale * f)) }));
  }, []);

  const doFit = () => setTransform({ x: 40, y: 40, scale: 1 });

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.center}>
        <div style={S.spinner} />
        <p style={S.loadTxt}>Extracting circuit components…</p>
        <p style={S.loadSub}>AI is identifying flip-flops, gates and wires</p>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────────
  if (!circuitData?.components?.length) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: '52px', animation: 'cd-pulse 2s ease infinite' }}>⚡</div>
        <p style={{ color: '#475569', fontSize: '15px', fontWeight: '600', margin: '8px 0 0' }}>No Circuit Data</p>
        <p style={{ color: '#1e293b', fontSize: '12px', margin: '4px 0 0' }}>Generate a Verilog design to render the circuit diagram</p>
      </div>
    );
  }

  const { components, connections = [], circuit_type, description } = circuitData;
  const selectedComp     = components.find(c => c.id === selected);
  const highlightedSet   = selected ? new Set([selected]) : null;
  const connectedSignals = selected
    ? connections.filter(c => c.from_comp === selected || c.to_comp === selected)
    : [];

  return (
    <div style={S.root}>
      {/* ── Toolbar ────────────────────────────────────────── */}
      <div style={S.toolbar}>
        <div style={S.tbL}>
          <span style={{
            ...S.badge,
            background: circuit_type === 'sequential' ? 'rgba(124,58,237,0.2)' : 'rgba(14,116,144,0.2)',
            color:      circuit_type === 'sequential' ? '#a78bfa' : '#22d3ee',
            borderColor:circuit_type === 'sequential' ? '#7c3aed' : '#0e7490',
          }}>
            {(circuit_type || 'CIRCUIT').toUpperCase()}
          </span>
          <span style={S.descTxt}>{description}</span>
        </div>
        <div style={S.tbR}>
          <button style={{ ...S.btn, ...(animated ? S.btnOn : {}) }} onClick={() => setAnimated(a => !a)}>
            {animated ? '⏸ Stop' : '▶ Animate'}
          </button>
          <button style={S.btn} onClick={() => setTransform(t => ({ ...t, scale: t.scale * 1.2 }))}>＋</button>
          <button style={S.btn} onClick={() => setTransform(t => ({ ...t, scale: t.scale / 1.2 }))}>－</button>
          <button style={S.btn} onClick={doFit}>⊙ Fit</button>
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────────── */}
      <div style={S.legend}>
        {[
          ['#7c3aed','Flip-Flop'], ['#b45309','AND/NAND'], ['#0e7490','OR/NOR'],
          ['#0369a1','XOR/XNOR'], ['#b91c1c','NOT'],       ['#10b981','Input'],
          ['#ef4444','Output'],   ['#f59e0b','Bus wire'],
        ].map(([col, lbl]) => (
          <div key={lbl} style={S.li}>
            <div style={{ ...S.ld, background: col }} />
            <span style={S.ll}>{lbl}</span>
          </div>
        ))}
      </div>

      {/* ── Canvas ─────────────────────────────────────────── */}
      <div style={S.canvasWrap}>
        <svg
          ref={svgRef}
          width="100%" height="100%"
          style={{ cursor: dragging ? 'grabbing' : 'grab', background: '#050810' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
          onClick={() => setSelected(null)}
        >
          <defs>
            <pattern id="cdgrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0L0 0 0 40" fill="none" stroke="#0f172a" strokeWidth="0.6" />
            </pattern>
            <pattern id="cdgrid2" width="200" height="200" patternUnits="userSpaceOnUse">
              <rect width="200" height="200" fill="none" stroke="#0d1f35" strokeWidth="0.8" />
            </pattern>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="#050810" />
          <rect width="100%" height="100%" fill="url(#cdgrid)" />
          <rect width="100%" height="100%" fill="url(#cdgrid2)" />

          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {connections.map(conn => (
              <WireComp
                key={conn.id}
                conn={conn}
                components={components}
                highlightedSet={highlightedSet}
                animated={animated}
              />
            ))}
            {components.map(comp => (
              <CompSymbol
                key={comp.id}
                comp={comp}
                selected={selected === comp.id}
                onSelect={setSelected}
              />
            ))}
          </g>
        </svg>

        {/* ── Info panel ────────────────────────────────────── */}
        {selectedComp && (
          <div style={S.infoPanel}>
            <div style={S.ipHead}>
              <span style={{
                ...S.ipBadge,
                background: (TYPE_COLORS[selectedComp.type]?.stroke || '#334155') + '25',
                color:      TYPE_COLORS[selectedComp.type]?.label   || '#94a3b8',
                borderColor:(TYPE_COLORS[selectedComp.type]?.stroke || '#334155') + '50',
              }}>
                {selectedComp.type.toUpperCase()}
              </span>
              <button style={S.ipClose} onClick={() => setSelected(null)}>✕</button>
            </div>
            <p style={S.ipTitle}>{selectedComp.label}</p>
            <div style={S.ipRow}><span style={S.ipK}>Bits</span><span style={S.ipV}>{selectedComp.bits}-bit</span></div>
            {selectedComp.signals && Object.entries(selectedComp.signals).map(([pin, sig]) => (
              <div key={pin} style={S.ipRow}>
                <span style={S.ipK}>{pin}</span>
                <span style={S.ipSig}>{sig}</span>
              </div>
            ))}
            {connectedSignals.length > 0 && (
              <>
                <div style={S.ipDiv} />
                <p style={S.ipSec}>Connections ({connectedSignals.length})</p>
                {connectedSignals.slice(0, 6).map(cn => (
                  <div key={cn.id} style={S.ipRow}>
                    <span style={S.ipK}>{cn.from_comp === selected ? '→ ' + cn.to_comp : '← ' + cn.from_comp}</span>
                    <span style={S.ipSig}>{cn.signal_name}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Footer stats ────────────────────────────────────── */}
      <div style={S.footer}>
        <span style={S.fs}>{components.length} components</span>
        <span style={S.fsep}>·</span>
        <span style={S.fs}>{connections.length} connections</span>
        <span style={S.fsep}>·</span>
        <span style={S.fs}>Scroll = zoom  ·  Drag = pan  ·  Click = inspect</span>
      </div>

      <style>{`
        @keyframes cd-spin  { to { transform: rotate(360deg); } }
        @keyframes cd-pulse { 0%,100%{ opacity:.6 } 50%{ opacity:1 } }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inline styles
// ─────────────────────────────────────────────────────────────
const S = {
  root: { display:'flex', flexDirection:'column', height:'100%', minHeight:'500px', background:'#050810', fontFamily:"'JetBrains Mono','Fira Code',monospace" },
  center: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', minHeight:'400px', gap:'10px', background:'#050810', fontFamily:"'JetBrains Mono',monospace" },
  spinner: { width:'36px', height:'36px', border:'3px solid #1e293b', borderTopColor:'#7c3aed', borderRadius:'50%', animation:'cd-spin 0.8s linear infinite' },
  loadTxt: { color:'#94a3b8', fontSize:'14px', fontWeight:'600', margin:0 },
  loadSub: { color:'#334155', fontSize:'12px', margin:0 },
  toolbar: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 14px', background:'#080d18', borderBottom:'1px solid #0f172a', flexShrink:0 },
  tbL: { display:'flex', alignItems:'center', gap:'10px' },
  tbR: { display:'flex', gap:'6px' },
  badge: { padding:'2px 10px', borderRadius:'4px', fontSize:'10px', fontWeight:'700', letterSpacing:'0.1em', border:'1px solid' },
  descTxt: { color:'#1e3a5f', fontSize:'11px' },
  btn: { background:'#0f172a', border:'1px solid #1e293b', color:'#475569', padding:'4px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'12px' },
  btnOn: { background:'rgba(16,185,129,0.12)', borderColor:'#10b981', color:'#10b981' },
  legend: { display:'flex', gap:'14px', padding:'5px 14px', background:'#060a14', borderBottom:'1px solid #0f172a', flexWrap:'wrap', flexShrink:0 },
  li: { display:'flex', alignItems:'center', gap:'5px' },
  ld: { width:'8px', height:'8px', borderRadius:'50%', flexShrink:0 },
  ll: { color:'#1e3a5f', fontSize:'10px' },
  canvasWrap: { flex:1, position:'relative', overflow:'hidden' },
  infoPanel: { position:'absolute', top:'12px', right:'12px', background:'rgba(8,13,24,0.97)', border:'1px solid #1e293b', borderRadius:'10px', padding:'12px', minWidth:'175px', maxWidth:'220px', backdropFilter:'blur(12px)', boxShadow:'0 8px 32px rgba(0,0,0,0.6)' },
  ipHead:  { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' },
  ipBadge: { padding:'2px 8px', borderRadius:'4px', fontSize:'9px', fontWeight:'700', letterSpacing:'0.08em', border:'1px solid' },
  ipClose: { background:'none', border:'none', color:'#334155', cursor:'pointer', fontSize:'14px', padding:0, lineHeight:1 },
  ipTitle: { color:'#e2e8f0', fontSize:'13px', fontWeight:'700', margin:'0 0 8px' },
  ipRow:   { display:'flex', justifyContent:'space-between', gap:'8px', marginBottom:'4px', alignItems:'baseline' },
  ipK:     { color:'#334155', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.06em' },
  ipV:     { color:'#94a3b8', fontSize:'11px', fontWeight:'600' },
  ipSig:   { color:'#38bdf8', fontSize:'10px', fontFamily:'monospace' },
  ipDiv:   { borderTop:'1px solid #1e293b', margin:'8px 0' },
  ipSec:   { color:'#475569', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 6px' },
  footer:  { display:'flex', alignItems:'center', gap:'8px', padding:'5px 14px', background:'#080d18', borderTop:'1px solid #0f172a', flexShrink:0 },
  fs:    { color:'#1e3a5f', fontSize:'10px' },
  fsep:  { color:'#0f172a', fontSize:'10px' },
};