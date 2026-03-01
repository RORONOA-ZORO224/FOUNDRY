import React, { useState } from 'react';
import './WaveformViewer.css';

function WaveformViewer({ waveform }) {
  const [expandedSignals, setExpandedSignals] = useState(new Set());

  if (!waveform || !waveform.signals || waveform.signals.length === 0) {
    return (
      <div className="waveform-empty">
        <p>⚠️ No waveform data available</p>
      </div>
    );
  }

  const { signals, max_time = 100, timeunit = 'ns' } = waveform;

  const toggleExpand = (signalName) => {
    setExpandedSignals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(signalName)) {
        newSet.delete(signalName);
      } else {
        newSet.add(signalName);
      }
      return newSet;
    });
  };

  const expandSignal = (signal) => {
    const bits = [];
    for (let i = signal.width - 1; i >= 0; i--) {
      bits.push({
        name: `${signal.name}[${i}]`,
        width: 1,
        values: signal.values.map(v => ({
          time: v.time,
          value: extractBit(v.value, i, signal.width)
        })),
        isBit: true
      });
    }
    return bits;
  };

  const extractBit = (value, bitIndex, width) => {
    if (!value) return '0';
    const str = String(value);
    
    // Handle hex values
    if (str.startsWith('0x')) {
      const num = parseInt(str, 16);
      return ((num >> bitIndex) & 1).toString();
    }
    
    // Handle binary values
    if (str.match(/^[01xzXZ]+$/)) {
      const reversedIndex = str.length - 1 - bitIndex;
      return reversedIndex >= 0 && reversedIndex < str.length ? str[reversedIndex] : '0';
    }
    
    return '0';
  };

  const renderSignals = () => {
    const rendered = [];
    
    signals.forEach((signal, idx) => {
      // Main signal
      rendered.push(
        <div key={signal.name} className="waveform-row">
          <div className="signal-name-cell">
            {signal.width > 1 && (
              <button 
                className={`expand-btn ${expandedSignals.has(signal.name) ? 'expanded' : ''}`}
                onClick={() => toggleExpand(signal.name)}
              >
                ▶
              </button>
            )}
            <span className="signal-name">{signal.name}</span>
            {signal.width > 1 && (
              <span className="signal-width">[{signal.width-1}:0]</span>
            )}
          </div>
          <div className="signal-wave-cell">
            {renderWave(signal, max_time)}
          </div>
        </div>
      );

      // Expanded bits
      if (signal.width > 1 && expandedSignals.has(signal.name)) {
        const bits = expandSignal(signal);
        bits.forEach(bit => {
          rendered.push(
            <div key={bit.name} className="waveform-row bit-row">
              <div className="signal-name-cell indent">
                <span className="signal-name">{bit.name}</span>
              </div>
              <div className="signal-wave-cell">
                {renderWave(bit, max_time)}
              </div>
            </div>
          );
        });
      }
    });

    return rendered;
  };

  const renderWave = (signal, maxTime) => {
    if (!signal.values || signal.values.length === 0) {
      return <div className="wave-segment wave-unknown" style={{ width: '100%' }}>No data</div>;
    }

    const segments = [];
    let prevValue = 'x';
    let prevTime = 0;

    signal.values.forEach((change, idx) => {
      const time = change.time;
      const value = change.value;

      if (time > prevTime) {
        const width = ((time - prevTime) / maxTime) * 100;
        segments.push(
          <div
            key={`${idx}-prev`}
            className={`wave-segment wave-${getValueClass(prevValue)}`}
            style={{ width: `${width}%` }}
            title={`${prevTime}-${time}${timeunit}: ${prevValue}`}
          >
            {signal.width > 1 && !signal.isBit && <span className="wave-value">{formatValue(prevValue)}</span>}
          </div>
        );
      }

      prevValue = value;
      prevTime = time;
    });

    // Final segment
    if (prevTime < maxTime) {
      const width = ((maxTime - prevTime) / maxTime) * 100;
      segments.push(
        <div
          key="final"
          className={`wave-segment wave-${getValueClass(prevValue)}`}
          style={{ width: `${width}%` }}
          title={`${prevTime}-${maxTime}${timeunit}: ${prevValue}`}
        >
          {signal.width > 1 && !signal.isBit && <span className="wave-value">{formatValue(prevValue)}</span>}
        </div>
      );
    }

    return <div className="wave-line">{segments}</div>;
  };

  const formatValue = (value) => {
    if (!value) return '';
    const str = String(value);
    if (str.length > 8) return str.substring(0, 6) + '...';
    return str;
  };

  const getValueClass = (value) => {
    const val = String(value).toLowerCase();
    if (val === '1' || val === 'h') return 'high';
    if (val === '0' || val === 'l') return 'low';
    if (val === 'x') return 'unknown';
    if (val === 'z') return 'tristate';
    return 'data';
  };

  return (
    <div className="waveform-viewer">
      <div className="waveform-header">
        <div className="waveform-info">
          <span className="info-item">📊 Signals: {signals.length}</span>
          <span className="info-item">⏱️ Duration: {max_time}{timeunit}</span>
          <span className="info-item">📈 Transitions: {signals.reduce((sum, s) => sum + s.values.length, 0)}</span>
        </div>
      </div>

      <div className="waveform-container">
        {renderSignals()}
      </div>

      <div className="waveform-legend">
        <span className="legend-item"><span className="legend-dot high"></span>High (1)</span>
        <span className="legend-item"><span className="legend-dot low"></span>Low (0)</span>
        <span className="legend-item"><span className="legend-dot data"></span>Data</span>
        <span className="legend-item"><span className="legend-dot unknown"></span>Unknown (X)</span>
        <span className="legend-item"><span className="legend-dot tristate"></span>Hi-Z</span>
      </div>
    </div>
  );
}

export default WaveformViewer;