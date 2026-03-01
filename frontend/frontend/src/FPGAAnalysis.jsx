import React from 'react';
import './FPGAAnalysis.css';

function FPGAAnalysis({ analysis }) {
  if (!analysis) {
    return (
      <div className="fpga-empty">
        <p>⚠️ No FPGA analysis available</p>
      </div>
    );
  }

  const { luts, ffs, brams, dsps, fits } = analysis;

  return (
    <div className="fpga-analysis">
      <div className="resource-summary">
        <h4>Estimated Resource Usage</h4>
        <div className="resource-grid">
          <div className="resource-card">
            <div className="resource-icon">🔲</div>
            <div className="resource-info">
              <div className="resource-label">LUTs</div>
              <div className="resource-value">{luts.toLocaleString()}</div>
              <div className="resource-desc">Logic cells</div>
            </div>
          </div>
          
          <div className="resource-card">
            <div className="resource-icon">📦</div>
            <div className="resource-info">
              <div className="resource-label">Flip-Flops</div>
              <div className="resource-value">{ffs.toLocaleString()}</div>
              <div className="resource-desc">Registers</div>
            </div>
          </div>
          
          <div className="resource-card">
            <div className="resource-icon">💾</div>
            <div className="resource-info">
              <div className="resource-label">BRAMs</div>
              <div className="resource-value">{brams}</div>
              <div className="resource-desc">Memory blocks</div>
            </div>
          </div>
          
          <div className="resource-card">
            <div className="resource-icon">✖️</div>
            <div className="resource-info">
              <div className="resource-label">DSP Blocks</div>
              <div className="resource-value">{dsps}</div>
              <div className="resource-desc">Multipliers</div>
            </div>
          </div>
        </div>
      </div>

      <div className="fpga-compatibility">
        <h4>Compatible FPGAs</h4>
        <p className="compat-subtitle">
          Your design fits in {fits.length} FPGA{fits.length !== 1 ? 's' : ''}
        </p>
        
        {fits.length > 0 ? (
          <div className="fpga-list">
            {fits.map((fpga, idx) => (
              <div key={idx} className="fpga-card">
                <div className="fpga-header">
                  <div className="fpga-name">{fpga.fpga}</div>
                  <div className={`fpga-badge ${
                    fpga.utilization < 50 ? 'good' : 
                    fpga.utilization < 80 ? 'medium' : 'high'
                  }`}>
                    {fpga.utilization}%
                  </div>
                </div>
                <div className="fpga-bar-container">
                  <div 
                    className="fpga-bar-fill" 
                    style={{ 
                      width: `${fpga.utilization}%`,
                      background: fpga.utilization < 50 ? '#10b981' : 
                                 fpga.utilization < 80 ? '#f59e0b' : '#ef4444'
                    }}
                  ></div>
                </div>
                <div className="fpga-status">
                  {fpga.utilization < 50 ? '✅ Excellent fit' : 
                   fpga.utilization < 80 ? '⚠️ Good fit' : '🔴 Tight fit'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-fit">
            <p>❌ Design is too large for available FPGAs</p>
            <p className="no-fit-hint">Consider simplifying or using a larger device</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default FPGAAnalysis;