import React, { useState } from 'react';
import './LearningMode.css';

function LearningMode({ explanations, code }) {
  const [selectedLine, setSelectedLine] = useState(null);

  if (!explanations || explanations.length === 0) {
    return (
      <div className="learning-empty">
        <p>⚠️ No learning explanations available</p>
      </div>
    );
  }

  const codeLines = code ? code.split('\n') : [];

  return (
    <div className="learning-mode">
      <div className="learning-header">
        <h4>📚 Line-by-Line Explanation</h4>
        <p className="learning-subtitle">
          Click on any line to see detailed explanation
        </p>
      </div>

      <div className="learning-container">
        {/* CODE SIDE */}
        <div className="code-side">
          <div className="code-header">
            <span>📝 Code</span>
          </div>
          <div className="code-lines">
            {explanations.map((exp, idx) => (
              <div
                key={idx}
                className={`code-line-row ${selectedLine === idx ? 'selected' : ''} ${exp.category ? `cat-${exp.category}` : ''}`}
                onClick={() => setSelectedLine(idx)}
              >
                <span className="line-num">{exp.line}</span>
                <code className="line-code">{exp.code}</code>
              </div>
            ))}
          </div>
        </div>

        {/* EXPLANATION SIDE */}
        <div className="explanation-side">
          <div className="explanation-header">
            <span>💡 Explanation</span>
          </div>
          <div className="explanation-content">
            {selectedLine !== null ? (
              <div className="explanation-detail">
                <div className="explanation-badge">
                  {getCategoryBadge(explanations[selectedLine].category)}
                </div>
                <div className="explanation-line">
                  Line {explanations[selectedLine].line}
                </div>
                <div className="explanation-code-highlight">
                  <code>{explanations[selectedLine].code}</code>
                </div>
                <div className="explanation-text">
                  {explanations[selectedLine].explanation}
                </div>
              </div>
            ) : (
              <div className="explanation-prompt">
                <div className="prompt-icon">👈</div>
                <p>Select a line from the code to see its explanation</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CATEGORY LEGEND */}
      <div className="category-legend">
        <span className="legend-title">Categories:</span>
        <span className="legend-badge declaration">Declaration</span>
        <span className="legend-badge port">Port</span>
        <span className="legend-badge logic">Logic</span>
        <span className="legend-badge sequential">Sequential</span>
        <span className="legend-badge combinational">Combinational</span>
      </div>
    </div>
  );
}

function getCategoryBadge(category) {
  const badges = {
    declaration: '📋 Declaration',
    port: '🔌 Port',
    logic: '⚡ Logic',
    sequential: '🔄 Sequential',
    combinational: '🔀 Combinational',
    structural: '🏗️ Structural'
  };
  return badges[category] || '📝 Code';
}

export default LearningMode;