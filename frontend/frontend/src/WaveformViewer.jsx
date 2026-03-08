/**
 * WaveformViewer.jsx — Oscilloscope-style SVG waveform viewer
 * • 1-bit  → coloured square-wave lines (HIGH=green, LOW=slate)
 * • n-bit  → hexagonal bus segments with hex labels
 * • Zoom controls, expandable buses, animation speed slider
 */
import React, { useState, useRef, useCallback } from 'react';

const NAME_W = 190;
const ROW_H  = 50;
const HDR_H  = 34;
const TOP    = 8;
const BOT    = 42;
const MID    = 25;

const C = {
  high:'#10b981', low:'#1e3a5f', hiZ:'#8b5cf6', unk:'#d97706',
  bus:'#3b82f6', busT:'#93c5fd',
  grid:'#080d18', tick:'#0e1f3d', tickT:'#1e3a5f',
  bg:'#050810', rowH:'rgba(59,130,246,0.04)', brd:'#0c1a30',
};

function sigY(v)  { const s = String(v).toLowerCase(); return s==='1'||s==='h'?TOP : s==='z'?MID : BOT; }
function sigC(v)  { const s = String(v).toLowerCase(); return s==='1'||s==='h'?C.high : s==='z'?C.hiZ : s==='x'?C.unk : C.low; }

/* ── 1-bit line wave ─────────────────────────────────────── */
function BitWave({ values, W, maxT }) {
  if (!values?.length) return null;
  const x = t => (t / maxT) * W;
  const els = [];
  for (let i = 0; i < values.length; i++) {
    const { time: t1, value: v } = values[i];
    const t2 = i < values.length-1 ? values[i+1].time : maxT;
    const x1 = x(t1), x2 = x(t2);
    const y  = sigY(v), col = sigC(v);
    if (i > 0) {
      const py = sigY(values[i-1].value);
      if (py !== y) els.push(<line key={`v${i}`} x1={x1} y1={py} x2={x1} y2={y} stroke="#475569" strokeWidth="1.5"/>);
    }
    if (v==='1'||v==='h') els.push(<rect key={`f${i}`} x={x1} y={TOP} width={x2-x1} height={BOT-TOP} fill="rgba(16,185,129,0.07)"/>);
    if (v==='x'||v==='X') els.push(<rect key={`xf${i}`} x={x1} y={TOP} width={x2-x1} height={BOT-TOP} fill="rgba(217,119,6,0.1)"/>);
    els.push(<line key={`h${i}`} x1={x1} y1={y} x2={x2} y2={y} stroke={col} strokeWidth="2"
              strokeDasharray={(v==='z'||v==='x')?'5,3':undefined}/>);
  }
  const last = values[values.length-1];
  if (x(last.time) < W) els.push(<line key="last" x1={x(last.time)} y1={sigY(last.value)} x2={W} y2={sigY(last.value)} stroke={sigC(last.value)} strokeWidth="2"/>);
  return <g>{els}</g>;
}

/* ── Bus wave ────────────────────────────────────────────── */
function BusWave({ values, W, maxT }) {
  if (!values?.length) return null;
  const x = t => (t / maxT) * W;
  const K = 7;
  const els = [];
  for (let i = 0; i < values.length; i++) {
    const { time: t1, value: v } = values[i];
    const t2 = i < values.length-1 ? values[i+1].time : maxT;
    const x1 = x(t1), x2 = x(t2), midX = (x1+x2)/2;
    const isX = !v || String(v).toLowerCase()==='x';
    const col = isX ? C.unk : C.bus;
    const fill= isX ? 'rgba(217,119,6,0.08)' : 'rgba(59,130,246,0.08)';
    const first = i===0, last = i===values.length-1;
    const lx1 = first ? x1 : x1+K, lx2 = last ? x2 : x2-K;
    const path = [
      `M ${x1},${first?TOP:MID}`, !first?`L ${lx1},${TOP}`:`L ${x1},${TOP}`,
      `L ${lx2},${TOP}`, last?`L ${x2},${TOP}`:`L ${x2},${MID}`,
      last?`L ${x2},${BOT}`:`L ${lx2},${BOT}`, `L ${lx1},${BOT}`,
      first?`L ${x1},${BOT}`:`L ${x1},${MID}`, 'Z',
    ].join(' ');
    els.push(<path key={`s${i}`} d={path} fill={fill} stroke={col} strokeWidth="1.5"/>);
    if (!first) {
      els.push(<line key={`xA${i}`} x1={x1} y1={MID} x2={x1+K} y2={TOP} stroke={col} strokeWidth="1.5"/>);
      els.push(<line key={`xB${i}`} x1={x1} y1={MID} x2={x1+K} y2={BOT} stroke={col} strokeWidth="1.5"/>);
    }
    if (x2-x1 > 28 && !isX) {
      const label = String(v); const disp = label.length>9 ? label.slice(0,8)+'…' : label;
      els.push(<text key={`t${i}`} x={midX} y={MID+4} textAnchor="middle" dominantBaseline="middle"
                fill={C.busT} fontSize="10" fontFamily="'JetBrains Mono',monospace" fontWeight="600">{disp}</text>);
    }
  }
  return <g>{els}</g>;
}

/* ── Single row ──────────────────────────────────────────── */
function WaveRow({ sig, W, maxT, hovered, onHover }) {
  const [expanded, setExpanded] = useState(false);
  const isBus = sig.width > 1;
  const isHov = hovered === sig.name;

  const expandBits = () => Array.from({length:sig.width}, (_,bi) => ({
    name: `${sig.name}[${sig.width-1-bi}]`, width:1,
    values: (sig.values||[]).map(({time,value}) => {
      const n = parseInt(String(value).replace(/^0[xX]/,''), 16);
      return { time, value: isNaN(n)?'x':((n>>(sig.width-1-bi))&1)?'1':'0' };
    }),
  }));

  const GRIDS = Math.floor(W/80)+1;

  return (
    <>
      <div style={{display:'flex', height:ROW_H, borderBottom:`1px solid ${C.brd}`,
                   background:isHov?C.rowH:'transparent', transition:'background .12s'}}
           onMouseEnter={()=>onHover(sig.name)} onMouseLeave={()=>onHover(null)}>
        {/* Name */}
        <div style={{width:NAME_W, flexShrink:0, display:'flex', alignItems:'center', gap:6,
                     padding:'0 10px', borderRight:`1px solid ${C.brd}`}}>
          {isBus && (
            <button onClick={()=>setExpanded(e=>!e)} style={{
              background:'none', border:'none', cursor:'pointer', color:'#334155',
              fontSize:10, padding:'2px 3px', borderRadius:3, flexShrink:0}}>
              {expanded?'▼':'▶'}
            </button>
          )}
          <span style={{color:'#94a3b8', fontSize:12, fontFamily:"'JetBrains Mono',monospace",
                        fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            {sig.name}
          </span>
          {isBus && <span style={{color:'#1e3a5f', fontSize:10, fontFamily:"'JetBrains Mono',monospace", flexShrink:0}}>[{sig.width-1}:0]</span>}
        </div>
        {/* Waves */}
        <div style={{flex:1, overflow:'hidden'}}>
          <svg width={W} height={ROW_H} style={{display:'block'}}>
            {Array.from({length:GRIDS},(_,i)=><line key={i} x1={i*80} y1={0} x2={i*80} y2={ROW_H} stroke={C.grid} strokeWidth="1"/>)}
            {isBus ? <BusWave values={sig.values} W={W} maxT={maxT}/>
                   : <BitWave values={sig.values} W={W} maxT={maxT}/>}
          </svg>
        </div>
      </div>
      {expanded && expandBits().map(bit => (
        <div key={bit.name} style={{display:'flex', height:ROW_H-10, borderBottom:`1px solid ${C.brd}`, background:'rgba(59,130,246,0.02)'}}>
          <div style={{width:NAME_W, flexShrink:0, display:'flex', alignItems:'center',
                       padding:'0 10px 0 30px', borderRight:`1px solid ${C.brd}`}}>
            <span style={{color:'#334155', fontSize:10, fontFamily:"'JetBrains Mono',monospace"}}>{bit.name}</span>
          </div>
          <div style={{flex:1, overflow:'hidden'}}>
            <svg width={W} height={ROW_H-10} style={{display:'block'}}>
              <BitWave values={bit.values} W={W} maxT={maxT}/>
            </svg>
          </div>
        </div>
      ))}
    </>
  );
}

/* ── Time header ─────────────────────────────────────────── */
function TimeAxis({ W, maxT, unit }) {
  const TICKS = Math.floor(W/80);
  return (
    <div style={{display:'flex', height:HDR_H, flexShrink:0}}>
      <div style={{width:NAME_W, flexShrink:0, borderRight:`1px solid ${C.brd}`,
                   borderBottom:`1px solid ${C.brd}`, display:'flex', alignItems:'center', padding:'0 10px'}}>
        <span style={{fontSize:9, color:C.tickT, fontFamily:"'JetBrains Mono',monospace",
                      textTransform:'uppercase', letterSpacing:'0.06em'}}>Signal</span>
      </div>
      <div style={{flex:1, overflow:'hidden', borderBottom:`1px solid ${C.brd}`}}>
        <svg width={W} height={HDR_H} style={{display:'block'}}>
          {Array.from({length:TICKS+1},(_,i)=>{
            const xp=(i/TICKS)*W, t=Math.round((i/TICKS)*maxT);
            return <g key={i}>
              <line x1={xp} y1={HDR_H-10} x2={xp} y2={HDR_H} stroke={C.tick} strokeWidth="1"/>
              <text x={xp+3} y={HDR_H-14} fill={C.tickT} fontSize="9" fontFamily="'JetBrains Mono',monospace">{t}{unit}</text>
            </g>;
          })}
        </svg>
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────── */
export default function WaveformViewer({ waveform }) {
  const [zoom,    setZoom]    = useState(1);
  const [hovered, setHovered] = useState(null);

  const handleWheel = useCallback(e => {
    if (e.ctrlKey||e.metaKey) { e.preventDefault(); setZoom(z=>Math.min(8,Math.max(0.5,z*(e.deltaY<0?1.15:0.87)))); }
  }, []);

  if (!waveform?.signals?.length) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                 height:300, background:C.bg, gap:8}}>
      <div style={{fontSize:40}}>📈</div>
      <p style={{color:'#475569',fontSize:14,fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>No Waveform Data</p>
      <p style={{color:'#1e293b',fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>Run simulation to generate waveforms</p>
    </div>
  );

  const { max_time=100, timeunit='ns' } = waveform;

  // Deduplicate signals by name — keep the entry with the most data points.
  // Root cause: the VCD parser sometimes emits both a declaration entry and a
  // dump-values entry for the same signal, producing identical rows.
  const signals = Object.values(
    (waveform.signals || []).reduce((acc, sig) => {
      const key = sig.name;
      if (!acc[key] || (sig.values?.length || 0) > (acc[key].values?.length || 0))
        acc[key] = sig;
      return acc;
    }, {})
  );

  const W = Math.max(900, 900*zoom);
  const totalTx = signals.reduce((s,g)=>s+(g.values?.length||0),0);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:400,background:C.bg,
                 fontFamily:"'JetBrains Mono','Fira Code',monospace",overflow:'hidden'}}
         onWheel={handleWheel}>

      {/* Info bar */}
      <div style={{display:'flex',alignItems:'center',gap:14,padding:'8px 14px',
                   background:'#060a14',borderBottom:`1px solid ${C.brd}`,flexWrap:'wrap',flexShrink:0}}>
        {[
          {dot:'#10b981',label:`Signals: ${signals.length}`},
          {dot:'#3b82f6',label:`Duration: ${max_time}${timeunit}`},
          {dot:'#f59e0b',label:`Transitions: ${totalTx}`},
        ].map(({dot,label})=>(
          <div key={label} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#475569',
                                   background:'#080d18',border:`1px solid ${C.brd}`,padding:'3px 10px',borderRadius:20}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:dot}}/>{label}
          </div>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
          <span style={{fontSize:10,color:C.tickT}}>Zoom</span>
          {['+','−','↺'].map((b,i)=>(
            <button key={b} style={{background:'#0f172a',border:`1px solid #1e293b`,color:'#475569',
                                    width:24,height:24,borderRadius:4,cursor:'pointer',fontSize:13,
                                    display:'flex',alignItems:'center',justifyContent:'center'}}
              onClick={()=>i===0?setZoom(z=>Math.min(8,z*1.25)):i===1?setZoom(z=>Math.max(0.5,z*0.8)):setZoom(1)}>
              {b}
            </button>
          ))}
          <span style={{fontSize:10,color:'#334155',minWidth:34,textAlign:'center'}}>{Math.round(zoom*100)}%</span>
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,overflow:'auto'}}>
        <div style={{width:NAME_W+W,minWidth:'100%',background:C.bg}}>
          <div style={{position:'sticky',top:0,zIndex:10,background:'#060a14'}}>
            <TimeAxis W={W} maxT={max_time} unit={timeunit}/>
          </div>
          {signals.map((s,i)=>(
            <WaveRow key={`${s.name}-${i}`} sig={s} W={W} maxT={max_time} hovered={hovered} onHover={setHovered}/>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{display:'flex',alignItems:'center',gap:14,padding:'6px 14px',
                   background:'#060a14',borderTop:`1px solid ${C.brd}`,flexWrap:'wrap',
                   flexShrink:0,fontSize:10,color:'#334155'}}>
        {[
          {col:C.high,label:'High (1)'},{col:C.low,label:'Low (0)'},
          {col:C.bus, label:'Data'},{col:C.unk,label:'Unknown (X)'},{col:C.hiZ,label:'Hi-Z'},
        ].map(({col,label})=>(
          <div key={label} style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:18,height:2.5,borderRadius:2,background:col}}/>
            <span>{label}</span>
          </div>
        ))}
        <span style={{marginLeft:'auto',fontSize:9,color:C.tickT}}>Ctrl+Scroll to zoom · Click ▶ to expand bus</span>
      </div>
    </div>
  );
}