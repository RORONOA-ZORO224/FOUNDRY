import React, { useState } from 'react';
import WaveformViewer from './WaveformViewer';
import SchematicViewer from './SchematicViewer';
import FPGAAnalysis from './FPGAAnalysis';
import LearningMode from './LearningMode';
import './App.css';

const GENAI_URL = 'http://localhost:5000';

function App() {
  const [description, setDescription] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [schematic, setSchematic] = useState(null);
  const [fpgaAnalysis, setFpgaAnalysis] = useState(null);
  const [learningMode, setLearningMode] = useState(null);
  const [activeTab, setActiveTab] = useState('code');

  const validation = result?.validation;
  const simulation = result?.simulation;

  async function handleGenerate(e) {
    e.preventDefault();

    const trimmed = description.trim();
    if (!trimmed) {
      setErrorMessage('Please describe the circuit before generating.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSchematic(null);
    setFpgaAnalysis(null);
    setLearningMode(null);

    const url = `${GENAI_URL}/generate`;
    const body = { description: trimmed };

    console.log('📤 Sending request', { url, body });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        console.error('Parse error', parseError);
        throw new Error('Invalid JSON response');
      }

      console.log('📥 Response received', data);

      if (!response.ok) {
        setResult(null);
        setErrorMessage(`Backend error (${response.status})`);
        return;
      }

      if (!data.success) {
        setErrorMessage('Generation failed. Check errors below.');
      } else {
        setErrorMessage(null);
      }

      setResult(data);

      // Fetch additional analyses if generation succeeded
      if (data.success && data.verilog_code) {
        fetchAdditionalAnalyses(data.verilog_code);
      }

    } catch (err) {
      console.error('Request error', err);
      setResult(null);
      setErrorMessage('Unable to reach backend. Is it running?');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAdditionalAnalyses(verilogCode) {
    // Fetch Schematic
    try {
      const schematicRes = await fetch(`${GENAI_URL}/schematic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verilog_code: verilogCode })
      });
      const schematicData = await schematicRes.json();
      if (schematicData.success) {
        setSchematic(schematicData.schematic);
      }
    } catch (err) {
      console.error('Schematic fetch failed', err);
    }

    // Fetch FPGA Analysis
    try {
      const fpgaRes = await fetch(`${GENAI_URL}/fpga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verilog_code: verilogCode })
      });
      const fpgaData = await fpgaRes.json();
      if (fpgaData.success) {
        setFpgaAnalysis(fpgaData.analysis);
      }
    } catch (err) {
      console.error('FPGA analysis failed', err);
    }

    // Fetch Learning Mode
    try {
      const learningRes = await fetch(`${GENAI_URL}/learning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verilog_code: verilogCode })
      });
      const learningData = await learningRes.json();
      if (learningData.success) {
        setLearningMode(learningData.explanations);
      }
    } catch (err) {
      console.error('Learning mode failed', err);
    }
  }

  async function handleCopy(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert('✅ Copied!');
    } catch (err) {
      alert('❌ Copy failed');
    }
  }

  function downloadFile(filename, contents) {
    const blob = new Blob([contents || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const moduleBaseName = result?.module_name || 'module';
  const showAutoFix = result?.auto_fixed && result?.fix_history && result.fix_history.length > 0;

  return (
    <div className="App" data-theme={theme}>
      <div className="app-shell">
        {/* HEADER */}
        <header className="app-header">
          <div className="header-content">
            <div className="brand">
              <h1 className="app-title">🔌 Foundry</h1>
              <p className="app-subtitle">AI-Powered Verilog Design Platform</p>
            </div>
            <button
              className="theme-toggle"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
          </div>
        </header>

        {/* MAIN */}
        <main className="app-main">
          {/* INPUT CARD */}
          <section className="input-section">
            <div className="section-header">
              <h2>Describe Your Circuit</h2>
              <p>Use natural language to describe hardware. Foundry generates, validates, and simulates it.</p>
            </div>

            <form onSubmit={handleGenerate} className="input-form">
              <textarea
                className="circuit-input"
                placeholder="Example: Create an 8-bit ALU with add, subtract, AND, OR, XOR operations"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
              />

              {/* EXAMPLE BUTTONS - IMPROVED */}
              <div className="examples-section">
                <span className="examples-label">Quick start:</span>
                <div className="example-chips">
                  <button 
                    type="button" 
                    className="chip"
                    onClick={() => setDescription('Create a 4-bit adder with carry in and carry out')}
                  >
                    4-bit Adder
                  </button>
                  <button 
                    type="button"
                    className="chip"
                    onClick={() => setDescription('Create an 8-bit counter with synchronous reset and enable')}
                  >
                    8-bit Counter
                  </button>
                  <button 
                    type="button"
                    className="chip"
                    onClick={() => setDescription('Create a 4-to-1 multiplexer')}
                  >
                    4:1 MUX
                  </button>
                  <button 
                    type="button"
                    className="chip"
                    onClick={() => setDescription('Create an 8-bit shift register with parallel load')}
                  >
                    Shift Register
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="alert alert-error">
                  <span className="alert-icon">⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                className="btn-generate"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    Generate Verilog
                  </>
                )}
              </button>
            </form>
          </section>

          {/* RESULTS GRID */}
          {result && (
            <section className="results-section">
              {/* STATUS BANNER */}
              <div className="status-banner">
                <div className="status-badges">
                  {validation?.success && <span className="badge success">✅ Valid</span>}
                  {validation?.success === false && <span className="badge error">❌ Invalid</span>}
                  {simulation?.success && <span className="badge success">✅ Simulated</span>}
                  {showAutoFix && <span className="badge warning">🔧 Auto-Fixed</span>}
                  {simulation?.waveform && <span className="badge info">📈 Waveform</span>}
                  {schematic && <span className="badge info">🔷 Schematic</span>}
                  {fpgaAnalysis && <span className="badge info">📊 FPGA</span>}
                </div>
              </div>

              {/* AUTO-FIX - ONLY IF ACTUALLY USED */}
              {showAutoFix && (
                <div className="result-card autofix-card">
                  <div className="card-header">
                    <h3>🔧 Auto-Fix Applied</h3>
                  </div>
                  <div className="card-content">
                    <p className="autofix-message">
                      AI automatically debugged and fixed {result.fix_history.length} compilation error(s)
                    </p>
                    {result.fix_history.map((fix, idx) => (
                      <div key={idx} className="fix-item">
                        <div className="fix-header">
                          <strong>Attempt {fix.attempt}</strong>
                          {fix.fixed ? (
                            <span className="badge success">✅ Fixed</span>
                          ) : (
                            <span className="badge error">❌ Failed</span>
                          )}
                        </div>
                        {fix.original_errors && (
                          <ul className="error-list-compact">
                            {fix.original_errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TABS */}
              <div className="tabs-container">
                <div className="tabs">
                  <button 
                    className={`tab ${activeTab === 'code' ? 'active' : ''}`}
                    onClick={() => setActiveTab('code')}
                  >
                    📝 Code
                  </button>
                  {simulation?.waveform && (
                    <button 
                      className={`tab ${activeTab === 'waveform' ? 'active' : ''}`}
                      onClick={() => setActiveTab('waveform')}
                    >
                      📈 Waveform
                    </button>
                  )}
                  {schematic && (
                    <button 
                      className={`tab ${activeTab === 'schematic' ? 'active' : ''}`}
                      onClick={() => setActiveTab('schematic')}
                    >
                      🔷 Schematic
                    </button>
                  )}
                  {fpgaAnalysis && (
                    <button 
                      className={`tab ${activeTab === 'fpga' ? 'active' : ''}`}
                      onClick={() => setActiveTab('fpga')}
                    >
                      📊 FPGA
                    </button>
                  )}
                  {learningMode && (
                    <button 
                      className={`tab ${activeTab === 'learn' ? 'active' : ''}`}
                      onClick={() => setActiveTab('learn')}
                    >
                      🎓 Learn
                    </button>
                  )}
                </div>

                <div className="tab-content">
                  {/* CODE TAB */}
                  {activeTab === 'code' && (
                    <div className="results-grid">
                      {/* VERILOG */}
                      {result?.verilog_code && (
                        <div className="result-card">
                          <div className="card-header">
                            <h3>📄 Generated Verilog</h3>
                            <div className="card-actions">
                              <button className="btn-icon" onClick={() => handleCopy(result.verilog_code)}>
                                📋 Copy
                              </button>
                              <button className="btn-icon" onClick={() => downloadFile(`${moduleBaseName}.v`, result.verilog_code)}>
                                💾 Download
                              </button>
                            </div>
                          </div>
                          <pre className="code-block">{result.verilog_code}</pre>
                        </div>
                      )}

                      {/* TESTBENCH */}
                      {result?.testbench_code && (
                        <div className="result-card">
                          <div className="card-header">
                            <h3>🧪 Testbench</h3>
                            <div className="card-actions">
                              <button className="btn-icon" onClick={() => handleCopy(result.testbench_code)}>
                                📋 Copy
                              </button>
                              <button className="btn-icon" onClick={() => downloadFile(`${moduleBaseName}_tb.v`, result.testbench_code)}>
                                💾 Download
                              </button>
                            </div>
                          </div>
                          <pre className="code-block">{result.testbench_code}</pre>
                        </div>
                      )}

                      {/* EXPLANATION */}
                      {result?.explanation && (
                        <div className="result-card full-width">
                          <div className="card-header">
                            <h3>💡 Explanation</h3>
                          </div>
                          <div className="card-content">
                            <p className="explanation-text">{result.explanation}</p>
                          </div>
                        </div>
                      )}

                      {/* SIMULATION OUTPUT */}
                      {simulation?.output && (
                        <div className="result-card full-width">
                          <div className="card-header">
                            <h3>📊 Simulation Output</h3>
                          </div>
                          <pre className="output-block">{simulation.output}</pre>
                        </div>
                      )}

                      {/* ERRORS */}
                      {validation?.errors && validation.errors.length > 0 && (
                        <div className="result-card full-width error-card">
                          <div className="card-header">
                            <h3>⚠️ Validation Errors</h3>
                          </div>
                          <ul className="error-list">
                            {validation.errors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* WAVEFORM TAB */}
                  {activeTab === 'waveform' && simulation?.waveform && (
                    <div className="tab-panel">
                      <WaveformViewer waveform={simulation.waveform} />
                    </div>
                  )}

                  {/* SCHEMATIC TAB */}
                  {activeTab === 'schematic' && schematic && (
                    <div className="tab-panel">
                      <SchematicViewer schematic={schematic} />
                    </div>
                  )}

                  {/* FPGA TAB */}
                  {activeTab === 'fpga' && fpgaAnalysis && (
                    <div className="tab-panel">
                      <FPGAAnalysis analysis={fpgaAnalysis} />
                    </div>
                  )}

                  {/* LEARNING TAB */}
                  {activeTab === 'learn' && learningMode && (
                    <div className="tab-panel">
                      <LearningMode explanations={learningMode} code={result.verilog_code} />
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </main>

        {/* FOOTER */}
        <footer className="app-footer">
          <div className="footer-content">
            <div className="footer-brand">
              <strong>Foundry</strong>
              <span>AI-Powered Hardware Design</span>
            </div>
            <div className="footer-tech">
              <span className="tech-badge">React</span>
              <span className="tech-badge">Python</span>
              <span className="tech-badge">Groq AI</span>
              <span className="tech-badge">Icarus Verilog</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;