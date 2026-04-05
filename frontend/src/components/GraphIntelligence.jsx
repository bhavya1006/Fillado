import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ForceGraph2D from 'react-force-graph-2d'

export default function GraphIntelligence() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const fgRef = useRef()

  const fetchGraph = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('http://localhost:8000/api/graph-data')
      if (!res.ok) throw new Error('Failed to fetch graph data')
      const data = await res.json()
      setGraphData(data)
      setLoading(false)
    } catch (err) {
      console.error(err)
      setError(err.message)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGraph()
    // Poll every 10 seconds to show dynamic updates if people add nodes
    const interval = setInterval(fetchGraph, 10000)
    return () => clearInterval(interval)
  }, [fetchGraph])

  // Optional: Center the graph visually on first load
  useEffect(() => {
    if (!loading && graphData.nodes.length > 0 && fgRef.current) {
      setTimeout(() => {
        fgRef.current.zoomToFit(600, 40)
      }, 500)
    }
  }, [loading, graphData])

  const handleNodeClick = useCallback(node => {
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000)
      fgRef.current.zoom(8, 2000)
    }
  }, [fgRef])

  return (
    <div className="glass-card" style={{ 
      position: 'relative', 
      width: '100%', 
      height: 'calc(100vh - 160px)', 
      overflow: 'hidden',
      border: '1px solid var(--border)',
      borderRadius: 2,
    }}>
      
      {/* Header / Legend */}
      <div style={{
        position: 'absolute', top: 24, left: 24, zIndex: 10,
        background: 'rgba(7,8,13,0.75)', backdropFilter: 'blur(12px)',
        padding: '18px 22px', borderRadius: 2,
        border: '1px solid var(--border)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '1.3rem',
          fontWeight: 400, fontStyle: 'italic',
          marginBottom: 8, color: 'var(--text-primary)',
        }}>
          Knowledge Graph
        </div>
        <div style={{
          fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 14,
          maxWidth: 280, lineHeight: 1.55,
          fontFamily: 'var(--font-body)',
        }}>
          Auto-discovered supply chain vulnerabilities and entity links. 
          Graph dynamically updates on Neo4j append calls.
        </div>
        <div style={{
          display: 'flex', gap: 14, fontSize: '0.65rem', fontWeight: 600,
          fontFamily: 'var(--font-mono)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, background: '#d4af37',
              clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
            }}></span> Trigger
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, background: '#a89cdb',
              clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
            }}></span> Entity
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, background: '#3dd68c',
              clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
            }}></span> Ticker
          </span>
        </div>
      </div>

      {/* Loading / Error States */}
      <AnimatePresence>
        {loading && graphData.nodes.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', zIndex: 20,
            }}>
            <div style={{
              fontSize: '0.85rem', color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', fontStyle: 'italic',
            }}>Extracting supply chain nodes...</div>
          </motion.div>
        )}
        {error && (
          <motion.div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            color: 'var(--accent-crimson)', zIndex: 20,
            fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
          }}>
            Error loading Graph: {error}
          </motion.div>
        )}
      </AnimatePresence>

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="transparent"
        nodeLabel="id"
        nodeColor={node => {
          if (node.group === 3) return '#d4af37' // gold for base event
          if (node.group === 1) return '#3dd68c' // jade for tickers
          return '#a89cdb' // lavender for entities
        }}
        nodeRelSize={7}
        nodeVal={node => node.val || 15}
        linkColor={() => 'rgba(212,175,55,0.15)'}
        linkWidth={1.5}
        linkDirectionalArrowLength={4.5}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick}
        linkLabel="label"
        d3VelocityDecay={0.3}
        // Custom canvas drawing for text labels on top of nodes
        nodeCanvasObjectMode={() => 'after'}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = node.id
          const fontSize = 12 / globalScale
          ctx.font = `600 ${fontSize}px 'DM Sans', sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = 'rgba(234, 230, 220, 0.9)'
          ctx.fillText(label, node.x, node.y + (node.val ? Math.sqrt(node.val)*2 : 8) + fontSize)
        }}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(link, ctx, globalScale) => {
          const max_length = 15
          if (globalScale < 1.5) return; // Only show link labels when zoomed in
          const label = link.label;
          if (!label) return;
          const start = link.source;
          const end = link.target;
          if (typeof start !== 'object' || typeof end !== 'object') return;
          const textPos = Object.assign(...['x', 'y'].map(c => ({
            [c]: start[c] + (end[c] - start[c]) / 2 
          })));
          const relLink = { x: end.x - start.x, y: end.y - start.y };
          let textAngle = Math.atan2(relLink.y, relLink.x);
          if (textAngle > Math.PI / 2) textAngle = -(Math.PI - textAngle);
          if (textAngle < -Math.PI / 2) textAngle = -(-Math.PI - textAngle);
          
          const fontSize = 8 / globalScale;
          ctx.font = `500 ${fontSize}px 'IBM Plex Mono', monospace`;
          ctx.save();
          ctx.translate(textPos.x, textPos.y);
          ctx.rotate(textAngle);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = 'rgba(212, 175, 55, 0.6)';
          ctx.fillText(label, 0, -2);
          ctx.restore();
        }}
      />
      
      {/* Refresh Button */}
      <button 
        onClick={fetchGraph}
        style={{
          position: 'absolute', bottom: 24, right: 24, zIndex: 10,
          background: 'rgba(212,175,55,0.08)',
          border: '1px solid rgba(212,175,55,0.2)',
          color: 'var(--accent-gold)', padding: '8px 16px', borderRadius: 2,
          fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
          transition: 'all 0.2s',
        }}
      >
        ↻ Sync Data
      </button>
    </div>
  )
}
