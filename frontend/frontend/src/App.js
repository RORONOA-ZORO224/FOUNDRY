import React, { useState, useEffect, useRef } from 'react';
import WaveformViewer  from './WaveformViewer';
import SchematicViewer from './SchematicViewer';
import FPGAAnalysis    from './FPGAAnalysis';
import LearningMode    from './LearningMode';
import './App.css';

const GENAI_URL = 'http://localhost:5000';

const MODELING_OPTIONS = [
  { value: 'behavioral', label: 'Behavioral',  icon: '🧠', desc: 'always / if / case', color: '#8b5cf6' },
  { value: 'dataflow',   label: 'Dataflow',    icon: '〰️', desc: 'assign + operators', color: '#06b6d4' },
  { value: 'gate_level', label: 'Gate-Level',  icon: '⚡', desc: 'and / or / not / xor', color: '#f59e0b' },
  { value: 'structural', label: 'Structural',  icon: '🏗️', desc: 'sub-module instances', color: '#10b981' },
];

const EXAMPLES = [
  '4-bit up counter','8-bit ALU','D flip-flop','FIFO buffer',
  '4-bit shift register','2-to-1 MUX','Full adder','Traffic light controller',
];

/* ── Terminal typing effect ──────────────────────────────────────── */
function TerminalText({ text, speed = 50, className = '' }) {
  const [displayed, setDisplayed] = useState('');
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  useEffect(() => {
    const cursor = setInterval(() => setShowCursor(v => !v), 500);
    return () => clearInterval(cursor);
  }, []);

  return (
    <span className={className}>
      {displayed}
      {showCursor && displayed.length < text.length && <span className="terminal-cursor">▋</span>}
    </span>
  );
}

/* ── Scroll-reveal hook ──────────────────────────────────────────── */
function useScrollReveal(threshold = 0.12) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ── Particle background ─────────────────────────────────────────── */
function ParticleBackground() {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    const particleCount = 50;
    
    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 2 + 1;
      }
      
      update() {
        this.x += this.vx;
        this.y += this.vy;
        
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
      }
      
      draw() {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }
    
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      
      // Connect nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 150) {
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.15 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      
      requestAnimationFrame(animate);
    }
    
    animate();
    
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return <canvas ref={canvasRef} className="particle-canvas" />;
}

/* ── Block Diagram — uses LAST module as top (structural safe) ── */
function BlockDiagram({ verilogCode }) {
  if (!verilogCode) return null;

  const allModules = [...verilogCode.matchAll(/module\s+(\w+)\s*[#(]/g)];
  const topModStart = allModules.length > 0
    ? allModules[allModules.length - 1].index
    : 0;
  const topCode = verilogCode.slice(topModStart);

  const inputs = [], outputs = [];
  const inRe  = /\binput\b\s*(?:wire\s+)?(?:\[(\d+):(\d+)\]\s+)?(\w+)/g;
  const outRe = /\boutput\b\s*(?:wire\s+|reg\s+)?(?:\[(\d+):(\d+)\]\s+)?(\w+)/g;
  let m;
  while ((m = inRe.exec(topCode)))  inputs.push({ name: m[3], w: m[1] ? `[${m[1]}:${m[2]}]` : '' });
  while ((m = outRe.exec(topCode))) outputs.push({ name: m[3], w: m[1] ? `[${m[1]}:${m[2]}]` : '' });
  const modName = (topCode.match(/module\s+(\w+)/) || [])[1] || 'module';

  const rows = Math.max(inputs.length, outputs.length, 2);
  const H = Math.max(140, rows * 36 + 60);
  const BX = 210, BY = 30, BW = 220, BH = H - 50;
  const pY = (list, i) => BY + 50 + i * Math.max(24, (BH - 50) / Math.max(list.length, 1));

  return (
    <div style={{ background:'#030810', padding:'16px 0 8px', display:'flex', flexDirection:'column', alignItems:'center' }}>
      <div style={{ fontSize:10, color:'#1e3a5f', fontFamily:"'JetBrains Mono',monospace",
                    letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8 }}>
        I/O Block Diagram
      </div>
      <svg width={640} height={H} viewBox={`0 0 640 ${H}`} style={{ maxWidth:'100%', overflow:'visible' }}>
        <rect x={BX} y={BY} width={BW} height={BH} rx="8" fill="#060f22" stroke="#162a4e" strokeWidth="1.5"/>
        <rect x={BX} y={BY} width={BW} height={26} rx="6" fill="#0f1c36"/>
        <text x={BX+BW/2} y={BY+17} textAnchor="middle" fill="#93c5fd"
              fontSize="12" fontFamily="'JetBrains Mono',monospace" fontWeight="700">{modName}</text>

        {inputs.map((p,i) => { const y=pY(inputs,i); return (
          <g key={`in${i}`}>
            <line x1={48} y1={y} x2={BX} y2={y} stroke="#3b82f6" strokeWidth="1.5"
                  strokeDasharray={p.w?'5,2':undefined}/>
            <polygon points={`${BX},${y} ${BX-8},${y-5} ${BX-8},${y+5}`} fill="#3b82f6"/>
            <rect x={4} y={y-12} width={42} height={16} rx="3" fill="#051a30" stroke="#1d4ed8" strokeWidth="1"/>
            <text x={25} y={y+4} textAnchor="middle" fill="#60a5fa" fontSize="9"
                  fontFamily="'JetBrains Mono',monospace" fontWeight="600">
              {p.name.length>7?p.name.slice(0,6)+'…':p.name}
            </text>
            {p.w && <text x={BX-12} y={y-5} fill="#1e3a5f" fontSize="8"
                          fontFamily="'JetBrains Mono',monospace" textAnchor="middle">{p.w}</text>}
            <text x={BX+8} y={y+4} fill="#334155" fontSize="8" fontFamily="'JetBrains Mono',monospace">
              {p.name}
            </text>
          </g>
        );})}

        {outputs.map((p,i) => { const y=pY(outputs,i); return (
          <g key={`out${i}`}>
            <line x1={BX+BW} y1={y} x2={592} y2={y} stroke="#ef4444" strokeWidth="1.5"
                  strokeDasharray={p.w?'5,2':undefined}/>
            <polygon points={`${594},${y} ${586},${y-5} ${586},${y+5}`} fill="#ef4444"/>
            <rect x={596} y={y-12} width={42} height={16} rx="3" fill="#1a0010" stroke="#7f1d1d" strokeWidth="1"/>
            <text x={617} y={y+4} textAnchor="middle" fill="#f87171" fontSize="9"
                  fontFamily="'JetBrains Mono',monospace" fontWeight="600">
              {p.name.length>7?p.name.slice(0,6)+'…':p.name}
            </text>
            {p.w && <text x={BX+BW+12} y={y-5} fill="#1e3a5f" fontSize="8"
                          fontFamily="'JetBrains Mono',monospace" textAnchor="middle">{p.w}</text>}
            <text x={BX+BW-8} y={y+4} fill="#334155" fontSize="8"
                  fontFamily="'JetBrains Mono',monospace" textAnchor="end">{p.name}</text>
          </g>
        );})}

        <g transform={`translate(8,${H-14})`}>
          <line x1={0} y1={4} x2={14} y2={4} stroke="#3b82f6" strokeWidth="1.5"/>
          <text x={18} y={8} fill="#334155" fontSize="9" fontFamily="'JetBrains Mono',monospace">Input</text>
          <line x1={55} y1={4} x2={69} y2={4} stroke="#ef4444" strokeWidth="1.5"/>
          <text x={73} y={8} fill="#334155" fontSize="9" fontFamily="'JetBrains Mono',monospace">Output</text>
        </g>
      </svg>
    </div>
  );
}

/* ── Animated result card ─────────────────────────────────────────── */
function RevealCard({ children, delay = 0, className = '' }) {
  const [ref, visible] = useScrollReveal();
  return (
    <div ref={ref} className={`result-card ${className} ${visible ? 'card-revealed' : 'card-hidden'}`}
         style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ── Terminal Window Wrapper ─────────────────────────────────────── */
function TerminalWindow({ title, children, className = '' }) {
  return (
    <div className={`terminal-window ${className}`}>
      <div className="terminal-header">
        <div className="terminal-buttons">
          <span className="term-btn term-close"></span>
          <span className="term-btn term-minimize"></span>
          <span className="term-btn term-maximize"></span>
        </div>
        <div className="terminal-title">{title}</div>
        <div className="terminal-buttons-spacer"></div>
      </div>
      <div className="terminal-body">
        {children}
      </div>
    </div>
  );
}

/* ── Main App ─────────────────────────────────────────────────────── */
export default function App() {
  const [description,    setDescription]    = useState('');
  const [modelingType,   setModelingType]   = useState('');
  const [result,         setResult]         = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [errorMessage,   setErrorMessage]   = useState(null);
  const [theme,          setTheme]          = useState('dark');

  const [schematic,      setSchematic]      = useState(null);
  const [circuitData,    setCircuitData]    = useState(null);
  const [loadingCircuit, setLoadingCircuit] = useState(false);
  const [fpgaAnalysis,   setFpgaAnalysis]   = useState(null);
  const [learningMode,   setLearningMode]   = useState(null);
  const [activeTab,      setActiveTab]      = useState('code');

  const [resultModelType, setResultModelType] = useState('');
  const [terminalLogs, setTerminalLogs] = useState([]);

  const validation     = result?.validation;
  const simulation     = result?.simulation;
  const showAutoFix    = result?.auto_fixed && result?.fix_history?.length > 0;
  const moduleBaseName = result?.module_name || 'circuit';
  const hasSchematic   = schematic || circuitData || loadingCircuit;
  const selectedModel  = MODELING_OPTIONS.find(o => o.value === modelingType);

  const addLog = (msg, type = 'info') => {
    setTerminalLogs(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);
  };

  async function handleGenerate(e) {
    e.preventDefault();
    if (!description.trim()) { setErrorMessage('Please describe the circuit.'); return; }
    if (!modelingType)        { setErrorMessage('Please select a modeling style first.'); return; }

    setLoading(true); setErrorMessage(null); setResult(null);
    setSchematic(null); setCircuitData(null); setFpgaAnalysis(null);
    setLearningMode(null); setActiveTab('code');
    setTerminalLogs([]);

    addLog('$ foundry generate --style=' + modelingType, 'command');
    addLog('Initializing AI synthesis engine...', 'info');
    addLog('Parsing circuit description...', 'info');

    try {
      const res  = await fetch(`${GENAI_URL}/generate`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ description: description.trim(), modeling_type: modelingType }),
      });
      const data = await res.json();
      
      if (!res.ok) { 
        setErrorMessage(`Backend error (${res.status})`); 
        addLog(`✗ Error: Backend returned ${res.status}`, 'error');
        return; 
      }
      
      if (!data.success) {
        setErrorMessage('Generation failed. See details below.');
        addLog('✗ Generation failed', 'error');
      } else {
        setErrorMessage(null);
        addLog('✓ Verilog code generated successfully', 'success');
        addLog(`✓ Module: ${data.module_name}`, 'success');
      }
      
      setResult(data);
      setResultModelType(data.modeling_type || modelingType);
      
      if (data.success && data.verilog_code) {
        fetchAdditionalAnalyses(data.verilog_code, data.modeling_type || modelingType);
      }
    } catch { 
      setErrorMessage('Cannot reach backend — is it running on port 5000?'); 
      addLog('✗ Connection failed: Backend unreachable', 'error');
    }
    finally  { setLoading(false); }
  }

  async function fetchAdditionalAnalyses(code, mtype) {
    const post = (path, body) =>
      fetch(`${GENAI_URL}${path}`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
      }).then(r => r.json()).catch(() => ({ success:false }));

    addLog('Running parallel analysis pipelines...', 'info');

    post('/schematic', { verilog_code: code })
      .then(d => { 
        if (d.success) {
          setSchematic(d.schematic); 
          addLog('✓ Schematic generated', 'success');
        }
      });

    setLoadingCircuit(true);
    post('/circuit', { verilog_code: code, modeling_type: mtype })
      .then(d => { 
        if (d.success) {
          setCircuitData(d.circuit); 
          addLog('✓ Circuit diagram generated', 'success');
        }
      })
      .finally(() => setLoadingCircuit(false));

    post('/fpga', { verilog_code: code })
      .then(d => { 
        if (d.success) {
          setFpgaAnalysis(d.analysis); 
          addLog('✓ FPGA analysis complete', 'success');
        }
      });

    post('/learning', { verilog_code: code, modeling_type: mtype })
      .then(d => { 
        if (d.success) {
          setLearningMode(d.explanations); 
          addLog('✓ Learning mode initialized', 'success');
        }
      });
  }

  async function handleCopy(t) {
    try { 
      await navigator.clipboard.writeText(t); 
      addLog('✓ Copied to clipboard', 'success');
    }
    catch { 
      addLog('✗ Copy failed', 'error');
    }
  }
  
  function download(name, content) {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([content], { type:'text/plain' })), download: name });
    a.click();
    addLog(`✓ Downloaded: ${name}`, 'success');
  }
  
  function toggleTheme() {
    const n = theme==='dark'?'light':'dark';
    setTheme(n); document.documentElement.setAttribute('data-theme', n);
  }

  const resultModelMeta = MODELING_OPTIONS.find(o => o.value === resultModelType);

  return (
    <div className={`app ${theme}`} data-theme={theme}>
      <ParticleBackground />
      
      <div className="app-container">

        {/* NAV */}
        <nav className="app-nav">
          <div className="nav-brand">
            <span className="brand-logo">⚡</span>
            <div className="brand-text">
              <span className="brand-name">FOUNDRY</span>
              <span className="brand-tag">AI Hardware Synthesis Engine</span>
            </div>
          </div>
          <div className="nav-actions">
            <div className="system-status">
              <span className="status-dot"></span>
              <span className="status-text">SYSTEM ONLINE</span>
            </div>
            <button className="btn-theme" onClick={toggleTheme}>
              {theme==='dark'?'☀️':'🌙'}
            </button>
          </div>
        </nav>

        <main className="app-main">

          {/* ── HERO ─────────────────────────────────────────── */}
          <section className="hero-section">
            <div className="hero-content animate-fade-up">
              <div className="hero-badge">
                <span className="badge-dot"></span>
                <span>NEXT-GEN RTL SYNTHESIS</span>
              </div>
              <h1 className="hero-title">
                <TerminalText text="$ foundry init" speed={80} className="terminal-prompt" />
                <br/>
                <span className="hero-accent">Transform Ideas into Silicon</span>
              </h1>
              <p className="hero-subtitle">
                AI-powered Verilog generation with real-time simulation, circuit visualization, FPGA mapping & interactive learning
              </p>
              <div className="hero-stats">
                <div className="stat-item">
                  <div className="stat-value">4</div>
                  <div className="stat-label">Modeling Styles</div>
                </div>
                <div className="stat-divider"></div>
                <div className="stat-item">
                  <div className="stat-value">∞</div>
                  <div className="stat-label">Possibilities</div>
                </div>
                <div className="stat-divider"></div>
                <div className="stat-item">
                  <div className="stat-value">&lt;1s</div>
                  <div className="stat-label">Generation Time</div>
                </div>
              </div>
            </div>

            <form className="input-form animate-fade-up anim-delay-100" onSubmit={handleGenerate}>

              {/* ── MODELING SELECTOR ───────────────────────── */}
              <TerminalWindow title="config.modeling_style" className="modeling-terminal">
                <div className="modeling-selector">
                  <div className="modeling-label">
                    <span className="terminal-prompt">$</span> SELECT MODELING PARADIGM
                    <span className="modeling-required">REQUIRED</span>
                  </div>
                  <div className="modeling-options">
                    {MODELING_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        className={`modeling-option${modelingType===opt.value?' selected':''}`}
                        style={{'--opt-color':opt.color}}
                        onClick={() => setModelingType(opt.value)} disabled={loading}>
                        <span className="opt-icon">{opt.icon}</span>
                        <div className="opt-text">
                          <span className="opt-label">{opt.label}</span>
                          <span className="opt-desc">{opt.desc}</span>
                        </div>
                        {modelingType===opt.value && (
                          <span className="opt-check">
                            <span className="checkmark">✓</span>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {selectedModel && (
                    <div className="modeling-hint" style={{borderLeftColor: selectedModel.color}}>
                      <span className="hint-icon" style={{color:selectedModel.color}}>&gt;</span>
                      <span style={{color:selectedModel.color, fontWeight:700}}>{selectedModel.label}</span>
                      <span className="hint-separator">—</span>
                      <span>{selectedModel.desc}</span>
                    </div>
                  )}
                </div>
              </TerminalWindow>

              {/* Input */}
              <TerminalWindow title="circuit.description" className="input-terminal">
                <div className="terminal-input-wrapper">
                  <span className="input-prompt">$</span>
                  <textarea className="circuit-input" rows={3} value={description}
                    onChange={e => setDescription(e.target.value)} disabled={loading}
                    placeholder="describe_circuit --input='your circuit description here'"/>
                </div>
              </TerminalWindow>

              {/* Examples */}
              <div className="examples-section">
                <span className="examples-label">
                  <span className="terminal-prompt">$</span> QUICK START TEMPLATES
                </span>
                <div className="example-chips">
                  {EXAMPLES.map(ex => (
                    <button key={ex} type="button" className="chip"
                      onClick={() => setDescription(ex)} disabled={loading}>
                      <span className="chip-icon">›</span>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {errorMessage && (
                <div className="alert alert-error">
                  <span className="alert-icon">✗</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <button type="submit" className="btn-generate" disabled={loading || !modelingType}>
                {loading
                  ? <><span className="spinner"/>SYNTHESIZING<span className="dots">...</span></>
                  : <>
                      <span className="btn-icon">⚡</span> 
                      GENERATE VERILOG
                      {selectedModel && <span className="btn-meta">--style={selectedModel.label.toLowerCase()}</span>}
                    </>}
              </button>
            </form>
          </section>

          {/* ── TERMINAL LOGS ───────────────────────────────── */}
          {terminalLogs.length > 0 && (
            <section className="terminal-logs-section animate-fade-up">
              <TerminalWindow title="foundry.log" className="logs-window">
                <div className="terminal-logs">
                  {terminalLogs.map((log, i) => (
                    <div key={i} className={`log-line log-${log.type}`}>
                      <span className="log-time">[{log.time}]</span>
                      <span className="log-msg">{log.msg}</span>
                    </div>
                  ))}
                </div>
              </TerminalWindow>
            </section>
          )}

          {/* ── RESULTS ─────────────────────────────────────── */}
          {result && (
            <section className="results-section animate-fade-up">

              {/* Status */}
              <div className="status-banner">
                <div className="status-header">
                  <span className="status-title">SYNTHESIS REPORT</span>
                  <div className="status-badges">
                    {resultModelMeta && (
                      <span className="badge badge-modeling" style={{
                        background:`${resultModelMeta.color}18`,
                        border:`1px solid ${resultModelMeta.color}44`, 
                        color:resultModelMeta.color
                      }}>
                        {resultModelMeta.icon} {resultModelMeta.label}
                      </span>
                    )}
                    {validation?.success
                      ? <span className="badge success">✓ VALID</span>
                      : <span className="badge error">✗ ERRORS</span>}
                    {simulation?.success
                      ? <span className="badge success">✓ SIMULATED</span>
                      : <span className="badge warning">⚠ SIM FAILED</span>}
                    {simulation?.waveform && <span className="badge info">📈 WAVEFORM</span>}
                    {hasSchematic         && <span className="badge info">⚡ CIRCUIT</span>}
                    {fpgaAnalysis         && <span className="badge info">📊 FPGA</span>}
                    {learningMode         && <span className="badge info">🎓 LEARN</span>}
                  </div>
                </div>
              </div>

              {/* Auto-fix */}
              {showAutoFix && (
                <RevealCard className="autofix-card">
                  <div className="card-header">
                    <h3>🔧 AUTO-FIX APPLIED</h3>
                  </div>
                  <div className="card-content">
                    <p className="autofix-message">
                      AI auto-corrected {result.fix_history.length} compilation error(s)
                    </p>
                    {result.fix_history.map((fix,i)=>(
                      <div key={i} className="fix-item">
                        <div className="fix-header">
                          <strong>Attempt #{fix.attempt}</strong>
                          {fix.fixed
                            ?<span className="badge success">✓ FIXED</span>
                            :<span className="badge error">✗ FAILED</span>}
                        </div>
                        {fix.original_errors&&(
                          <ul className="error-list-compact">
                            {fix.original_errors.map((e,j)=><li key={j}>{e}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </RevealCard>
              )}

              {/* ── TABS ─────────────────────────────────────── */}
              <div className="tabs-container animate-fade-up anim-delay-100">
                <div className="tabs">
                  {[
                    { id:'code',      label:'CODE', icon:'📝' },
                    { id:'waveform',  label:'WAVEFORM', icon:'📈', cond:!!simulation?.waveform },
                    { id:'schematic', label:'CIRCUIT', icon:'⚡', cond:hasSchematic,
                      extra: loadingCircuit&&<span className="tab-spinner">⏳</span> },
                    { id:'fpga',      label:'FPGA', icon:'📊', cond:!!fpgaAnalysis },
                    { id:'learn',     label:'LEARN', icon:'🎓', cond:!!learningMode },
                  ].filter(t => t.cond !== false).map(t => (
                    <button key={t.id} className={`tab${activeTab===t.id?' active':''}`}
                      onClick={()=>setActiveTab(t.id)}>
                      <span className="tab-icon">{t.icon}</span>
                      <span className="tab-label">{t.label}</span>
                      {t.extra||null}
                    </button>
                  ))}
                </div>

                <div className="tab-content">

                  {/* CODE TAB */}
                  {activeTab==='code' && (
                    <div className="results-grid">

                      {result?.verilog_code && (
                        <RevealCard className="full-width" delay={0}>
                          <div className="card-header">
                            <h3>🔲 BLOCK DIAGRAM</h3>
                            {resultModelMeta && (
                              <span className="badge" style={{fontSize:10,
                                background:`${resultModelMeta.color}18`,
                                border:`1px solid ${resultModelMeta.color}44`,
                                color:resultModelMeta.color}}>
                                {resultModelMeta.label}
                              </span>
                            )}
                          </div>
                          <BlockDiagram verilogCode={result.verilog_code}/>
                        </RevealCard>
                      )}

                      {result?.verilog_code && (
                        <RevealCard delay={60}>
                          <div className="card-header">
                            <h3>📄 VERILOG SOURCE</h3>
                            <div className="card-actions">
                              <button className="btn-icon" onClick={()=>handleCopy(result.verilog_code)}>
                                📋 COPY
                              </button>
                              <button className="btn-icon" onClick={()=>download(`${moduleBaseName}.v`,result.verilog_code)}>
                                💾 SAVE
                              </button>
                            </div>
                          </div>
                          <pre className="code-block">{result.verilog_code}</pre>
                        </RevealCard>
                      )}

                      {result?.testbench_code && (
                        <RevealCard delay={120}>
                          <div className="card-header">
                            <h3>🧪 TESTBENCH</h3>
                            <div className="card-actions">
                              <button className="btn-icon" onClick={()=>handleCopy(result.testbench_code)}>
                                📋 COPY
                              </button>
                              <button className="btn-icon" onClick={()=>download(`${moduleBaseName}_tb.v`,result.testbench_code)}>
                                💾 SAVE
                              </button>
                            </div>
                          </div>
                          <pre className="code-block">{result.testbench_code}</pre>
                        </RevealCard>
                      )}

                      {result?.explanation && (
                        <RevealCard className="full-width" delay={180}>
                          <div className="card-header"><h3>💡 EXPLANATION</h3></div>
                          <div className="card-content">
                            <p className="explanation-text">{result.explanation}</p>
                          </div>
                        </RevealCard>
                      )}

                      {simulation?.output && (
                        <RevealCard className="full-width" delay={240}>
                          <div className="card-header"><h3>📊 SIMULATION OUTPUT</h3></div>
                          <pre className="output-block">{simulation.output}</pre>
                        </RevealCard>
                      )}

                      {validation?.errors?.length > 0 && (
                        <RevealCard className="full-width error-card" delay={300}>
                          <div className="card-header"><h3>⚠️ VALIDATION ERRORS</h3></div>
                          <ul className="error-list">
                            {validation.errors.map((e,i)=><li key={i}>{e}</li>)}
                          </ul>
                        </RevealCard>
                      )}
                    </div>
                  )}

                  {/* WAVEFORM TAB */}
                  {activeTab==='waveform' && simulation?.waveform && (
                    <div style={{padding:0,minHeight:480}}>
                      <WaveformViewer waveform={simulation.waveform}/>
                    </div>
                  )}
                  {activeTab==='waveform' && !simulation?.waveform && (
                    <div className="tab-empty">
                      <div className="tab-empty-icon">📈</div>
                      <p>NO WAVEFORM DATA</p>
                      <small>Simulation may have failed — check the Code tab</small>
                    </div>
                  )}

                  {/* CIRCUIT TAB */}
                  {activeTab==='schematic' && (
                    <div className="tab-panel schematic-tab-panel">
                      <SchematicViewer
                        schematic={schematic}
                        circuitData={circuitData}
                        loadingCircuit={loadingCircuit}
                        modelingType={resultModelType}
                        verilogCode={result?.verilog_code}
                      />
                    </div>
                  )}

                  {/* FPGA TAB */}
                  {activeTab==='fpga' && fpgaAnalysis && (
                    <div className="tab-panel">
                      <FPGAAnalysis analysis={fpgaAnalysis}/>
                    </div>
                  )}

                  {/* LEARN TAB */}
                  {activeTab==='learn' && learningMode && (
                    <div className="tab-panel learning-tab-panel">
                      <LearningMode
                        explanations={learningMode}
                        code={result.verilog_code}
                        modelingType={resultModelType}
                      />
                    </div>
                  )}
                  {activeTab==='learn' && !learningMode && (
                    <div className="tab-empty">
                      <div className="tab-empty-icon">🎓</div>
                      <p>LOADING EXPLANATIONS...</p>
                    </div>
                  )}

                </div>
              </div>
            </section>
          )}
        </main>

        <footer className="app-footer">
          <div className="footer-content">
            <div className="footer-brand">
              <strong>FOUNDRY</strong>
              <span>Next-Generation Hardware Synthesis Platform</span>
            </div>
            <div className="footer-tech">
              {['React','Python','Groq AI','Icarus Verilog','WebGL'].map(t=>(
                <span key={t} className="tech-badge">{t}</span>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}