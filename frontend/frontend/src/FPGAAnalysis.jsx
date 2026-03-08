/**
 * FPGAAnalysis.jsx — Complete FPGA resource analysis dashboard
 * • Animated radial SVG gauges
 * • Full component breakdown table by category
 * • Timing / power estimates
 * • FPGA compatibility bars
 */
import React, { useEffect, useRef, useState } from 'react';

const FPGA_MAX = { LUTs:53200, FFs:106400, BRAMs:2100, DSPs:220 };

const CAT_COLORS = {
  'Sequential':   '#8b5cf6',
  'Gate-Level':   '#f59e0b',
  'Combinational':'#06b6d4',
  'Arithmetic':   '#10b981',
  'Memory':       '#3b82f6',
  'Other':        '#475569',
};

/* ── Radial gauge ─────────────────────────────────────────── */
function Gauge({ value, max, label, sub, animate }) {
  const pct = max > 0 ? Math.min(100, (value/max)*100) : 0;
  const R=36, CX=52, CY=52, circ=2*Math.PI*R;
  const col = pct < 50 ? '#10b981' : pct < 80 ? '#f59e0b' : '#ef4444';
  const dash = (pct/100)*circ;

  return (
    <div style={{
      flex:'1 1 150px', minWidth:140, display:'flex', flexDirection:'column',
      alignItems:'center', gap:6, padding:'14px 10px',
      background:'#060f22', border:'1px solid #0e1f3d', borderRadius:12,
    }}>
      <svg width={104} height={104} viewBox="0 0 104 104">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#0e1f3d" strokeWidth="8"/>
        <circle cx={CX} cy={CY} r={R} fill="none"
                stroke={col} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${animate?dash:0} ${circ}`}
                strokeDashoffset={circ*0.25}
                style={{transition:'stroke-dasharray 1.2s ease'}}/>
        <text x={CX} y={CY-4} textAnchor="middle"
              fill={col} fontSize="16" fontFamily="'JetBrains Mono',monospace" fontWeight="800">
          {value.toLocaleString()}
        </text>
        <text x={CX} y={CY+12} textAnchor="middle"
              fill="#1e3a5f" fontSize="9" fontFamily="'JetBrains Mono',monospace">
          {pct.toFixed(1)}%
        </text>
      </svg>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:11,fontWeight:700,color:'#94a3b8',
                     textTransform:'uppercase',letterSpacing:'0.07em'}}>{label}</div>
        <div style={{fontSize:10,color:'#1e3a5f',fontFamily:"'JetBrains Mono',monospace"}}>{sub}</div>
      </div>
    </div>
  );
}

/* ── Component row ────────────────────────────────────────── */
function CompRow({ icon, name, count, description, category }) {
  const col = CAT_COLORS[category] || CAT_COLORS.Other;
  if (!count || count === 0) return null;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
      background:'#060f22', border:'1px solid #0e1f3d', borderRadius:8, marginBottom:5,
    }}>
      <span style={{fontSize:17,flexShrink:0}}>{icon||'🔲'}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:2}}>
          <span style={{fontSize:12,fontWeight:700,color:'#e2e8f0',
                        fontFamily:"'JetBrains Mono',monospace"}}>{name}</span>
          <span style={{fontSize:9,color:col,background:`${col}18`,
                        border:`1px solid ${col}40`,padding:'1px 6px',
                        borderRadius:8,fontWeight:700,letterSpacing:'0.05em'}}>
            {category}
          </span>
        </div>
        <div style={{fontSize:11,color:'#475569',fontFamily:"'JetBrains Mono',monospace"}}>
          {description}
        </div>
      </div>
      <div style={{fontSize:20,fontWeight:800,color:col,
                   fontFamily:"'JetBrains Mono',monospace",flexShrink:0,minWidth:36,textAlign:'right'}}>
        {count}
      </div>
    </div>
  );
}

/* ── FPGA bar ─────────────────────────────────────────────── */
function FPGABar({ fpga, utilization, animate }) {
  const tier = utilization<30 ? {l:'⭐ Ideal',c:'#10b981'}
             : utilization<60 ? {l:'✓ Good', c:'#06b6d4'}
             : utilization<85 ? {l:'⚡ Tight',c:'#f59e0b'}
             :                  {l:'⚠ Full', c:'#ef4444'};
  return (
    <div style={{padding:'12px 14px',background:'#060f22',border:'1px solid #0e1f3d',
                 borderRadius:10,marginBottom:7}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
        <span style={{fontSize:13,fontWeight:700,color:'#e2e8f0',
                      fontFamily:"'JetBrains Mono',monospace"}}>{fpga}</span>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:11,color:tier.c,fontWeight:600}}>{tier.l}</span>
          <span style={{fontSize:12,color:tier.c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>
            {utilization}%
          </span>
        </div>
      </div>
      <div style={{height:5,background:'#0e1f3d',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',borderRadius:3,background:tier.c,
                     width:animate?`${utilization}%`:'0%',
                     transition:'width 1s ease'}}/>
      </div>
    </div>
  );
}

/* ── Timing card ──────────────────────────────────────────── */
function TimingCard({ label, value, unit, col, borderCol }) {
  return (
    <div style={{flex:'1 1 160px',minWidth:140,padding:'16px',
                 background:'#060f22',border:`1px solid ${borderCol||'#0e1f3d'}`,
                 borderRadius:12,textAlign:'center'}}>
      <div style={{fontSize:10,color:'#475569',textTransform:'uppercase',
                   letterSpacing:'0.08em',marginBottom:8}}>{label}</div>
      <div style={{fontSize:30,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",
                   lineHeight:1,color:col||'#93c5fd'}}>{value}</div>
      <div style={{fontSize:11,color:'#475569',marginTop:5,
                   textTransform:'uppercase',letterSpacing:'0.05em'}}>{unit}</div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────── */
export default function FPGAAnalysis({ analysis }) {
  const [animate, setAnimate] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setAnimate(true); }, { threshold:0.1 }
    );
    if (rootRef.current) obs.observe(rootRef.current);
    return () => obs.disconnect();
  }, []);

  if (!analysis) return (
    <div style={{padding:40,textAlign:'center',color:'#1e3a5f',
                 fontFamily:"'JetBrains Mono',monospace"}}>
      ⚠️ No FPGA analysis available
    </div>
  );

  const { luts=0, ffs=0, brams=0, dsps=0, components=[], fits=[] } = analysis;

  /* Timing heuristics */
  const critNs = parseFloat((2 + luts*0.012 + dsps*1.8).toFixed(1));
  const maxMHz = parseFloat((1000/critNs).toFixed(1));
  const dynMW  = parseFloat((luts*0.04 + ffs*0.02 + dsps*8 + brams*15).toFixed(1));
  const statMW = parseFloat((dynMW*0.43).toFixed(1));
  const logicLvl = Math.max(1, Math.floor(Math.log2(Math.max(luts,1)+1)));

  /* Group components by category */
  const byCategory = {};
  components.forEach(c => {
    const k = c.category||'Other';
    if (!byCategory[k]) byCategory[k] = [];
    byCategory[k].push(c);
  });

  const S = {
    root:    { padding:'20px 24px', fontFamily:"'Space Grotesk',sans-serif", color:'#e2e8f0', overflowY:'auto' },
    section: { marginBottom:26 },
    secHead: { display:'flex', alignItems:'center', gap:8, marginBottom:14 },
    dot:     { width:8, height:8, borderRadius:'50%', flexShrink:0 },
    secLbl:  { fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#475569' },
  };

  return (
    <div style={S.root} ref={rootRef}>

      {/* ── Resource Utilization ───────────────────────── */}
      <div style={S.section}>
        <div style={S.secHead}>
          <div style={{...S.dot,background:'#8b5cf6'}}/>
          <span style={S.secLbl}>Resource Utilization</span>
          <span style={{fontSize:10,color:'#1e3a5f',marginLeft:8}}>vs. Zynq-7020 max</span>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>
          <Gauge value={luts}  max={FPGA_MAX.LUTs}  label="LUTs"       sub="Logic cells"   animate={animate}/>
          <Gauge value={ffs}   max={FPGA_MAX.FFs}   label="Flip-Flops" sub="Registers"     animate={animate}/>
          <Gauge value={brams} max={FPGA_MAX.BRAMs} label="BRAMs"      sub="Memory blocks" animate={animate}/>
          <Gauge value={dsps}  max={FPGA_MAX.DSPs}  label="DSPs"       sub="Multipliers"   animate={animate}/>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          {[
            ['SLICES', Math.max(1,Math.ceil(luts/4))],
            ['TOTAL BITS', ffs],
            ['LOGIC LEVELS', `${logicLvl} stages`],
          ].map(([l,v])=>(
            <div key={l} style={{padding:'8px 14px',background:'#060f22',
                                  border:'1px solid #0e1f3d',borderRadius:8,
                                  fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>
              <span style={{color:'#1e3a5f'}}>{l} </span>
              <strong style={{color:'#93c5fd'}}>{v}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* ── Component Breakdown ────────────────────────── */}
      {components.length > 0 && (
        <div style={S.section}>
          <div style={S.secHead}>
            <div style={{...S.dot,background:'#06b6d4'}}/>
            <span style={S.secLbl}>Component Breakdown</span>
            <span style={{fontSize:10,color:'#1e3a5f',marginLeft:8}}>
              {components.length} component type{components.length!==1?'s':''}
            </span>
          </div>
          {Object.entries(byCategory).map(([cat,comps])=>(
            <div key={cat} style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,
                           color:CAT_COLORS[cat]||'#475569',
                           textTransform:'uppercase',letterSpacing:'0.07em',
                           marginBottom:7,
                           paddingLeft:6,
                           borderLeft:`3px solid ${CAT_COLORS[cat]||'#475569'}`}}>
                &nbsp;{cat}
              </div>
              {comps.map((c,i)=>(
                <CompRow key={i}
                  icon={c.icon} name={c.name} count={c.count}
                  description={c.description} category={c.category}/>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Timing & Power ─────────────────────────────── */}
      <div style={S.section}>
        <div style={S.secHead}>
          <div style={{...S.dot,background:'#f59e0b'}}/>
          <span style={S.secLbl}>Timing &amp; Power Estimates</span>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
          <TimingCard label="Critical Path" value={critNs} unit="ns"
                      col="#a78bfa" borderCol="rgba(139,92,246,0.3)"/>
          <TimingCard label="Max Clock" value={maxMHz} unit="MHz"
                      col="#34d399" borderCol="rgba(16,185,129,0.3)"/>
          <TimingCard label="Est. Power" value={dynMW+statMW} unit="mW"
                      col="#60a5fa" borderCol="rgba(59,130,246,0.3)"/>
        </div>
        {[
          {l:'Dynamic', v:dynMW,  tot:dynMW+statMW, col:'#3b82f6', u:'mW'},
          {l:'Static',  v:statMW, tot:dynMW+statMW, col:'#8b5cf6', u:'mW'},
          {l:'Crit. Path', v:critNs, tot:Math.max(critNs,20), col:'#f59e0b', u:'ns'},
        ].map(({l,v,tot,col,u})=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:10,marginBottom:7}}>
            <div style={{width:80,fontSize:10,color:'#475569',textAlign:'right',flexShrink:0}}>{l}</div>
            <div style={{flex:1,height:5,background:'#0e1f3d',borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',background:col,borderRadius:3,
                           width:animate?`${Math.min(100,(v/tot)*100)}%`:'0%',
                           transition:'width 1.2s ease'}}/>
            </div>
            <div style={{width:64,fontSize:10,color:col,
                         fontFamily:"'JetBrains Mono',monospace",fontWeight:600,
                         flexShrink:0,textAlign:'right'}}>
              {v} {u}
            </div>
          </div>
        ))}
      </div>

      {/* ── Compatible FPGAs ───────────────────────────── */}
      <div style={S.section}>
        <div style={{...S.secHead,justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{...S.dot,background:'#10b981'}}/>
            <span style={S.secLbl}>Compatible FPGAs</span>
          </div>
          <span style={{fontSize:11,color:'#06b6d4',background:'rgba(6,182,212,0.1)',
                        border:'1px solid rgba(6,182,212,0.25)',padding:'2px 10px',
                        borderRadius:10,fontWeight:700}}>
            {fits.length} DEVICES
          </span>
        </div>
        {fits.length > 0
          ? fits.map(f=><FPGABar key={f.fpga} fpga={f.fpga} utilization={f.utilization} animate={animate}/>)
          : <div style={{padding:'18px',textAlign:'center',color:'#1e3a5f',fontSize:13,
                         fontFamily:"'JetBrains Mono',monospace"}}>
              ❌ Design too large — consider optimising or targeting a larger device.
            </div>
        }
      </div>

    </div>
  );
}