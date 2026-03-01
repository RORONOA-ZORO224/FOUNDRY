import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import './SchematicViewer.css';

cytoscape.use(dagre);

function SchematicViewer({ schematic }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!schematic || !containerRef.current) return;

    const { nodes, edges } = schematic;

    if (!nodes || nodes.length === 0) {
      return;
    }

    // Convert to Cytoscape format
    const elements = [
      ...nodes.map(node => ({
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          width: node.width || 1
        }
      })),
      ...edges.map((edge, idx) => ({
        data: {
          id: `edge-${idx}`,
          source: edge.source,
          target: edge.target
        }
      }))
    ];

    // Destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    // Create Cytoscape instance
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'background-color': '#667eea',
            'color': '#fff',
            'font-size': '12px',
            'font-weight': 'bold',
            'width': '80px',
            'height': '50px',
            'shape': 'roundrectangle',
            'border-width': 2,
            'border-color': '#5568d3',
            'text-wrap': 'wrap',
            'text-max-width': '70px'
          }
        },
        {
          selector: 'node[type="input"]',
          style: {
            'background-color': '#10b981',
            'border-color': '#059669',
            'shape': 'triangle'
          }
        },
        {
          selector: 'node[type="output"]',
          style: {
            'background-color': '#ef4444',
            'border-color': '#dc2626',
            'shape': 'triangle',
            'transform': 'rotate(180deg)'
          }
        },
        {
          selector: 'node[type="register"]',
          style: {
            'background-color': '#8b5cf6',
            'border-color': '#7c3aed',
            'shape': 'rectangle'
          }
        },
        {
          selector: 'node[type="logic"]',
          style: {
            'background-color': '#f59e0b',
            'border-color': '#d97706',
            'shape': 'ellipse',
            'width': '70px',
            'height': '70px'
          }
        },
        {
          selector: 'node[type="sequential"]',
          style: {
            'background-color': '#3b82f6',
            'border-color': '#2563eb',
            'shape': 'rectangle'
          }
        },
        {
          selector: 'node[type="combinational"]',
          style: {
            'background-color': '#06b6d4',
            'border-color': '#0891b2',
            'shape': 'roundrectangle'
          }
        },
        {
          selector: 'node[type="wire"]',
          style: {
            'background-color': '#64748b',
            'border-color': '#475569',
            'shape': 'ellipse',
            'width': '40px',
            'height': '40px'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 3,
            'line-color': '#64748b',
            'target-arrow-color': '#64748b',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.5
          }
        }
      ],
      layout: {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 60,
        rankSep: 120,
        padding: 30
      }
    });

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [schematic]);

  if (!schematic || !schematic.nodes || schematic.nodes.length === 0) {
    return (
      <div className="schematic-empty">
        <p>⚠️ No schematic data available</p>
        <p className="empty-hint">Schematic generation works best with simple circuits</p>
      </div>
    );
  }

  return (
    <div className="schematic-container">
      <div className="schematic-legend">
        <div className="legend-item">
          <span className="legend-shape triangle green"></span>
          <span>Input</span>
        </div>
        <div className="legend-item">
          <span className="legend-shape triangle red"></span>
          <span>Output</span>
        </div>
        <div className="legend-item">
          <span className="legend-shape rect purple"></span>
          <span>Register</span>
        </div>
        <div className="legend-item">
          <span className="legend-shape circle orange"></span>
          <span>Logic</span>
        </div>
        <div className="legend-item">
          <span className="legend-shape rect blue"></span>
          <span>Sequential</span>
        </div>
      </div>
      <div ref={containerRef} className="schematic-canvas"></div>
    </div>
  );
}

export default SchematicViewer;