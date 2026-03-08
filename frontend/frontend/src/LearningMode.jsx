/**
 * LearningMode.jsx — Fixed line-by-line Verilog explainer
 *
 * Bug fixes:
 *  - Blank/whitespace lines now have pointerEvents:'none' — no more hover bleed-through
 *  - Accepts modelingType prop to show correct category labels for gate/structural
 *  - 'gate' and 'structural' categories fully styled
 *  - All explanation categories correctly highlighted
 *
 * Features:
 *  - Left pane: syntax-highlighted code with hover-sync
 *  - Right pane: explanation cards with smooth scroll sync
 *  - Category filter tabs + search
 *  - Reading progress bar
 *  - Concept hint chips
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';

/* ── Category definitions ─────────────────────────────────── */
const CAT = {
  declaration:   { label:'Declaration',   color:'#a78bfa', bg:'rgba(167,139,250,0.12)', border:'rgba(167,139,250,0.3)',  icon:'📦' },
  port:          { label:'Port',          color:'#34d399', bg:'rgba(52,211,153,0.12)',  border:'rgba(52,211,153,0.3)',   icon:'🔌' },
  sequential:    { label:'Sequential',    color:'#60a5fa', bg:'rgba(96,165,250,0.12)',  border:'rgba(96,165,250,0.3)',   icon:'⏱'  },
  combinational: { label:'Combinational', color:'#fbbf24', bg:'rgba(251,191,36,0.12)',  border:'rgba(251,191,36,0.3)',   icon:'⚡' },
  gate:          { label:'Gate',          color:'#f59e0b', bg:'rgba(245,158,11,0.12)',  border:'rgba(245,158,11,0.3)',   icon:'🔲' },
  structural:    { label:'Structural',    color:'#22d3ee', bg:'rgba(34,211,238,0.12)',  border:'rgba(34,211,238,0.3)',   icon:'🏗'  },
  logic:         { label:'Logic',         color:'#f87171', bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.3)', icon:'🔮' },
  comment:       { label:'Comment',       color:'#475569', bg:'rgba(71,85,105,0.12)',   border:'rgba(71,85,105,0.3)',   icon:'💬' },
};

/* ── Concept hints ────────────────────────────────────────── */
const HINTS = {
  sequential:    [{ text:'Clock edge triggers flip-flop', color:'#60a5fa' }, { text:'State preserved between cycles', color:'#818cf8' }],
  combinational: [{ text:'Output depends only on current inputs', color:'#fbbf24' }],
  gate:          [{ text:'Primitive logic gate — maps directly to silicon', color:'#f59e0b' }],
  structural:    [{ text:'Sub-module instantiation — hierarchical design', color:'#22d3ee' }],
  declaration:   [{ text:'Module boundary definition', color:'#a78bfa' }],
  port:          [{ text:'Signal crossing module boundary', color:'#34d399' }],
};

/* ── Tokenizer ────────────────────────────────────────────── */
const KW  = new Set(['module','endmodule','input','output','inout','wire','reg','always','begin','end',
                     'if','else','case','casez','casex','endcase','assign','parameter','localparam',
                     'posedge','negedge','initial','for','generate','endgenerate','integer',
                     'function','endfunction','task','endtask','and','or','not','nand','nor','xor','xnor','buf','bufif']);
const BLT = new Set(['$dumpfile','$dumpvars','$finish','$monitor','$display','$time','$random']);
const TC  = { keyword:'#c084fc', builtin:'#f472b6', identifier:'#e2e8f0',
              number:'#fb923c', string:'#4ade80', operator:'#94a3b8', comment:'#4b5563', plain:'#64748b' };

function tokenize(line) {
  if (!line.trim()) return [{ t:'plain', s:line||' ' }];
  if (line.trim().startsWith('//')) return [{ t:'comment', s:line }];
  const toks = [];
  let rem = line;
  while (rem.length) {
    if (rem.startsWith('//'))   { toks.push({ t:'comment',    s:rem }); break; }
    const str = rem.match(/^"[^"]*"/);
    if (str)  { toks.push({ t:'string',     s:str[0]  }); rem = rem.slice(str[0].length);  continue; }
    const num = rem.match(/^\d+(?:'[bhodBHOD][0-9a-fA-FxXzZ_]+)?/);
    if (num)  { toks.push({ t:'number',     s:num[0]  }); rem = rem.slice(num[0].length);  continue; }
    const id  = rem.match(/^[a-zA-Z_$][\w$]*/);
    if (id)   { const w=id[0]; toks.push({ t:KW.has(w)?'keyword':BLT.has(w)?'builtin':'identifier', s:w }); rem=rem.slice(w.length); continue; }
    const op  = rem.match(/^[=<>!&|^~+\-*/%[\]{}();:,\.?@#]+/);
    if (op)   { toks.push({ t:'operator',   s:op[0]  }); rem = rem.slice(op[0].length);  continue; }
    const ws  = rem.match(/^\s+/);
    if (ws)   { toks.push({ t:'plain',      s:ws[0]  }); rem = rem.slice(ws[0].length);  continue; }
    toks.push({ t:'plain', s:rem[0] }); rem = rem.slice(1);
  }
  return toks;
}

function HLine({ code }) {
  const toks = useMemo(() => tokenize(code), [code]);
  return <>{toks.map((tk,i)=><span key={i} style={{color:TC[tk.t]}}>{tk.s}</span>)}</>;
}

/* ── Explanation card ─────────────────────────────────────── */
function ExpCard({ item, active, onHover, onLeave }) {
  const c = CAT[item.category] || CAT.logic;
  return (
    <div
      id={`exp-${item.line}`}
      style={{
        ...L.card,
        background: active ? c.bg : '#080d18',
        borderColor: active ? c.color : '#0f172a',
        boxShadow: active ? `0 0 0 1px ${c.color}33, 0 4px 16px rgba(0,0,0,0.4)` : 'none',
        transform: active ? 'translateX(2px)' : 'none',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={() => onHover(item.line)}
      onMouseLeave={onLeave}
    >
      <div style={L.cardHead}>
        <span style={L.lineNum}>L{item.line}</span>
        <span style={{...L.catBadge, color:c.color, background:c.bg, borderColor:c.border}}>
          {c.icon} {c.label}
        </span>
      </div>
      <code style={L.cardCode}>{item.code.trim() || '(blank)'}</code>
      <p style={L.cardExp}>{item.explanation}</p>
      {(HINTS[item.category]||[]).length > 0 && (
        <div style={L.chips}>
          {HINTS[item.category].map((h,i)=>(
            <span key={i} style={{...L.chip, color:h.color, borderColor:h.color+'44', background:h.color+'10'}}>
              💡 {h.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main LearningMode ────────────────────────────────────── */
export default function LearningMode({ explanations = [], code = '', modelingType = 'behavioral' }) {
  const [hovered, setHovered] = useState(null);
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');
  const [readSet, setReadSet] = useState(new Set());
  const expRef  = useRef(null);
  const codeRef = useRef(null);

  // Split ALL lines of code (including blank ones)
  const codeLines = useMemo(() => code.split('\n'), [code]);

  // Filter + search explanations
  const filtered = useMemo(() => {
    let items = explanations;
    if (filter !== 'all') items = items.filter(e => e.category === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(e => e.explanation.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
    }
    return items;
  }, [explanations, filter, search]);

  // Count per category
  const counts = useMemo(() => {
    const c = {};
    for (const e of explanations) c[e.category] = (c[e.category]||0)+1;
    return c;
  }, [explanations]);

  // Set of line numbers that have explanations
  const expLines = useMemo(() => new Set(explanations.map(e => e.line)), [explanations]);

  const progress = explanations.length > 0 ? Math.round((readSet.size/explanations.length)*100) : 0;

  const onCodeHover = useCallback((ln) => {
    setHovered(ln);
    setReadSet(r => new Set([...r, ln]));
    // Scroll explanation card into view
    requestAnimationFrame(() => {
      document.getElementById(`exp-${ln}`)?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    });
  }, []);

  const onExpHover = useCallback((ln) => {
    setHovered(ln);
    // Scroll code line into view
    requestAnimationFrame(() => {
      document.getElementById(`cl-${ln}`)?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    });
  }, []);

  if (!explanations.length) {
    return (
      <div style={L.empty}>
        <div style={{fontSize:48}}>📖</div>
        <p style={{color:'#475569',fontSize:16,fontWeight:600,margin:0}}>No Explanations Available</p>
        <p style={{color:'#1e293b',fontSize:12,margin:0}}>Generate a design to get line-by-line explanations</p>
      </div>
    );
  }

  return (
    <div style={L.root}>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div style={L.toolbar}>
        <div style={L.tbLeft}>
          <button
            style={{...L.fBtn, ...(filter==='all'?L.fBtnOn:{})}}
            onClick={() => setFilter('all')}>
            All <span style={L.cnt}>{explanations.length}</span>
          </button>
          {Object.entries(CAT).filter(([k]) => counts[k]).map(([key,c]) => (
            <button key={key}
              style={{...L.fBtn, ...(filter===key?{background:c.bg,color:c.color,borderColor:c.border}:{})}}
              onClick={() => setFilter(f => f===key?'all':key)}>
              {c.icon} {c.label} <span style={L.cnt}>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div style={L.tbRight}>
          <div style={L.searchBox}>
            <span style={{fontSize:12}}>🔍</span>
            <input style={L.searchIn} placeholder="Search…" value={search}
                   onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>
      </div>

      {/* ── Progress ─────────────────────────────────────── */}
      <div style={L.progRow}>
        <div style={L.progTrack}>
          <div style={{...L.progFill, width:`${progress}%`}}/>
        </div>
        <span style={L.progLbl}>{progress}% explored · {readSet.size}/{explanations.length} lines</span>
      </div>

      {/* ── Panes ────────────────────────────────────────── */}
      <div style={L.panes}>

        {/* Left: Code pane */}
        <div style={L.codePane} ref={codeRef}>
          <div style={L.paneHead}>
            <span style={L.paneTitle}>Source</span>
            <span style={L.paneHint}>Hover a line →</span>
          </div>
          <div style={L.codeBody}>
            {codeLines.map((line, i) => {
              const ln       = i + 1;
              const isBlank  = !line.trim();
              const hasExp   = expLines.has(ln);
              const isHov    = hovered === ln;
              const catKey   = explanations.find(e => e.line === ln)?.category;
              const catColor = catKey ? CAT[catKey]?.color : null;

              return (
                <div
                  key={ln}
                  id={`cl-${ln}`}
                  style={{
                    ...L.codeLine,
                    // CRITICAL FIX: blank lines get pointerEvents:none so they can't
                    // accidentally trigger the hover of adjacent lines
                    pointerEvents: isBlank ? 'none' : 'auto',
                    background: isHov ? 'rgba(124,58,237,0.08)' : 'transparent',
                    cursor: (hasExp && !isBlank) ? 'pointer' : 'default',
                    minHeight: isBlank ? 18 : 'auto',
                  }}
                  onMouseEnter={() => { if (hasExp && !isBlank) onCodeHover(ln); }}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span style={{...L.gutter, color: isHov?(catColor||'#a78bfa'):'#1e293b'}}>{ln}</span>
                  <span style={{
                    ...L.indicator,
                    background: (hasExp && !isBlank) ? (catColor||'#334155') : 'transparent',
                    opacity: isHov ? 1 : 0.35,
                  }}/>
                  <code style={{...L.codeContent, color: isBlank?'transparent':'inherit'}}>
                    {isBlank ? ' ' : <HLine code={line}/>}
                  </code>
                  {hasExp && isHov && !isBlank && (
                    <span style={{...L.chevron, color: catColor||'#a78bfa'}}>▸</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Explanations pane */}
        <div style={L.expPane} ref={expRef}>
          <div style={L.paneHead}>
            <span style={L.paneTitle}>Explanations</span>
            <span style={L.paneHint}>{filtered.length} shown</span>
          </div>
          <div style={L.expBody}>
            {filtered.length === 0
              ? (
                <div style={L.noRes}>
                  <span style={{fontSize:24}}>🔍</span>
                  <p style={{color:'#475569',margin:0}}>No matching lines</p>
                </div>
              )
              : filtered.map(item => (
                <ExpCard
                  key={item.line}
                  item={item}
                  active={hovered === item.line}
                  onHover={onExpHover}
                  onLeave={() => setHovered(null)}
                />
              ))
            }
          </div>
        </div>
      </div>

      {/* ── Stats footer ─────────────────────────────────── */}
      <div style={L.stats}>
        {Object.entries(counts).map(([key,cnt]) => {
          const c = CAT[key]; if (!c) return null;
          return (
            <div key={key} style={L.statChip}>
              <span style={{...L.statDot,background:c.color}}/>
              <span style={L.statLbl}>{c.label}</span>
              <span style={{...L.statCnt,color:c.color}}>{cnt}</span>
            </div>
          );
        })}
        <span style={{marginLeft:'auto',fontSize:10,color:'#1e3a5f',fontFamily:"'JetBrains Mono',monospace"}}>
          {modelingType?.replace('_','-')} style
        </span>
      </div>
    </div>
  );
}

/* ── Styles ───────────────────────────────────────────────── */
const L = {
  root:     { display:'flex', flexDirection:'column', height:'100%', background:'#050810', fontFamily:"'JetBrains Mono','Fira Code',monospace", overflow:'hidden' },
  empty:    { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'300px', gap:10 },
  toolbar:  { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#080d18', borderBottom:'1px solid #0f172a', flexWrap:'wrap', gap:8, flexShrink:0 },
  tbLeft:   { display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' },
  tbRight:  { display:'flex', gap:8 },
  fBtn:     { display:'flex', alignItems:'center', gap:4, background:'#0f172a', border:'1px solid #1e293b', color:'#475569', padding:'4px 10px', borderRadius:20, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:"'JetBrains Mono',monospace" },
  fBtnOn:   { background:'rgba(124,58,237,0.12)', color:'#a78bfa', borderColor:'rgba(124,58,237,0.3)' },
  cnt:      { background:'#1e293b', borderRadius:10, padding:'0 5px', fontSize:9, color:'#64748b' },
  searchBox:{ display:'flex', alignItems:'center', gap:6, background:'#0f172a', border:'1px solid #1e293b', borderRadius:8, padding:'4px 10px' },
  searchIn: { background:'transparent', border:'none', outline:'none', color:'#94a3b8', fontSize:11, width:140, fontFamily:'inherit' },
  progRow:  { display:'flex', alignItems:'center', gap:10, padding:'5px 12px', background:'#060a14', borderBottom:'1px solid #0f172a', flexShrink:0 },
  progTrack:{ flex:1, height:4, background:'#0f172a', borderRadius:2, overflow:'hidden' },
  progFill: { height:'100%', background:'linear-gradient(90deg,#7c3aed,#10b981)', borderRadius:2, transition:'width 0.5s ease' },
  progLbl:  { fontSize:10, color:'#334155', flexShrink:0 },
  panes:    { display:'flex', flex:1, overflow:'hidden' },
  codePane: { flex:'0 0 52%', display:'flex', flexDirection:'column', borderRight:'1px solid #0f172a', overflow:'hidden' },
  expPane:  { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  paneHead: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 12px', background:'#080d18', borderBottom:'1px solid #0f172a', flexShrink:0 },
  paneTitle:{ color:'#475569', fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700 },
  paneHint: { color:'#1e293b', fontSize:10 },
  codeBody: { flex:1, overflowY:'auto', padding:'4px 0' },
  codeLine: { display:'flex', alignItems:'center', padding:'0px 0', transition:'background 0.1s', userSelect:'none' },
  gutter:   { width:40, textAlign:'right', paddingRight:8, fontSize:10, userSelect:'none', flexShrink:0, transition:'color 0.15s', fontFamily:"'JetBrains Mono',monospace" },
  indicator:{ width:3, height:16, borderRadius:1.5, marginRight:8, flexShrink:0, transition:'background 0.15s' },
  codeContent:{ flex:1, fontSize:12, lineHeight:'22px', whiteSpace:'pre', overflowX:'hidden', textOverflow:'ellipsis', userSelect:'text', fontFamily:"'JetBrains Mono',monospace" },
  chevron:  { marginLeft:6, marginRight:8, fontSize:12, flexShrink:0 },
  expBody:  { flex:1, overflowY:'auto', padding:8, display:'flex', flexDirection:'column', gap:6 },
  card:     { border:'1px solid', borderRadius:8, padding:'10px 12px', cursor:'pointer' },
  cardHead: { display:'flex', alignItems:'center', gap:8, marginBottom:6 },
  lineNum:  { color:'#334155', fontSize:10, fontWeight:700, minWidth:28, fontFamily:"'JetBrains Mono',monospace" },
  catBadge: { padding:'2px 8px', borderRadius:10, fontSize:9, fontWeight:700, border:'1px solid', textTransform:'uppercase', letterSpacing:'0.06em' },
  cardCode: { display:'block', fontSize:11, color:'#64748b', background:'#080d18', padding:'4px 8px', borderRadius:4, marginBottom:6, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:"'JetBrains Mono',monospace", border:'1px solid #0f172a' },
  cardExp:  { fontSize:12, color:'#94a3b8', lineHeight:1.6, margin:0 },
  chips:    { display:'flex', gap:6, marginTop:8, flexWrap:'wrap' },
  chip:     { padding:'2px 8px', borderRadius:10, fontSize:9, fontWeight:600, border:'1px solid' },
  noRes:    { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:40, gap:8 },
  stats:    { display:'flex', gap:16, padding:'6px 12px', background:'#080d18', borderTop:'1px solid #0f172a', flexShrink:0, flexWrap:'wrap', alignItems:'center' },
  statChip: { display:'flex', alignItems:'center', gap:5 },
  statDot:  { width:6, height:6, borderRadius:'50%', flexShrink:0 },
  statLbl:  { fontSize:10, color:'#334155' },
  statCnt:  { fontSize:10, fontWeight:700 },
};