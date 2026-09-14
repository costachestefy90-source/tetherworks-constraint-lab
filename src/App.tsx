import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Activity,
  Anchor,
  ArrowDown,
  ArrowLeftRight,
  ChevronRight,
  CircleDot,
  CircleGauge,
  Code2,
  Compass,
  Crosshair,
  Github,
  Grip,
  Info,
  Link2,
  MousePointer2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Wind,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { ConstraintWorld, Link, Material, PhysicsConfig, Point, WorldMetrics, materialLabel } from './physics'
import { getPreset, PRESETS, PresetDefinition } from './presets'

type ToolMode = 'select' | 'anchor' | 'mass' | 'cut'

const WORLD_WIDTH = 1000
const WORLD_HEIGHT = 620

const DEFAULT_CONFIG: PhysicsConfig = {
  gravity: 86,
  wind: 0,
  damping: 0.93,
  stiffness: 0.92,
  solverPasses: 8,
}

const EMPTY_METRICS: WorldMetrics = {
  energy: 0,
  kinetic: 0,
  potential: 0,
  spring: 0,
  maxTension: 0,
  avgTension: 0,
  stability: 100,
  centerOfMass: { x: 500, y: 310 },
}

const formatNumber = (value: number, digits = 0) => value.toLocaleString('en-US', { maximumFractionDigits: digits })
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const materialColors: Record<Material, { stroke: string; accent: string; soft: string }> = {
  rope: { stroke: '#f6c453', accent: '#ffcf68', soft: '#604e26' },
  chain: { stroke: '#bee6e0', accent: '#e5fffa', soft: '#2d5658' },
  elastic: { stroke: '#f08a5d', accent: '#ffab7c', soft: '#693f36' },
}

function Sparkline({ values }: { values: number[] }) {
  const points = useMemo(() => {
    const safeValues = values.length ? values : [0]
    const maximum = Math.max(...safeValues, 1)
    const minimum = Math.min(...safeValues, 0)
    const range = Math.max(maximum - minimum, 1)
    return safeValues
      .map((value, index) => {
        const x = (index / Math.max(1, safeValues.length - 1)) * 120
        const y = 34 - ((value - minimum) / range) * 28
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [values])

  return (
    <svg className="sparkline" viewBox="0 0 120 38" role="img" aria-label="Energy trend">
      <path d="M0 34H120" className="sparkline-baseline" />
      <polyline points={points} className="sparkline-line" />
    </svg>
  )
}

function PresetCard({ preset, active, onClick }: { preset: PresetDefinition; active: boolean; onClick: () => void }) {
  const colors = materialColors[preset.material]
  return (
    <button className={`preset-card ${active ? 'is-active' : ''}`} onClick={onClick} style={{ '--preset-accent': colors.stroke } as CSSProperties}>
      <span className="preset-index">{preset.eyebrow}</span>
      <span className="preset-name-row">
        <span className="preset-name">{preset.name}</span>
        <ChevronRight size={14} strokeWidth={2.4} />
      </span>
      <span className="preset-description">{preset.description}</span>
      <span className="preset-badge"><span className="dot" />{preset.badge}</span>
    </button>
  )
}

function Metric({ label, value, note, tone = 'mint', icon }: { label: string; value: string; note: string; tone?: string; icon: React.ReactNode }) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <div className="metric-topline"><span className="metric-label">{label}</span><span className="metric-icon">{icon}</span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  )
}

function SliderRow({ label, value, min, max, step, display, onChange, hint }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void; hint?: string }) {
  return (
    <label className="slider-row">
      <span className="slider-label"><span>{label}</span><span className="slider-value">{display}</span></span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {hint ? <span className="slider-hint">{hint}</span> : null}
    </label>
  )
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function drawAnchor(context: CanvasRenderingContext2D, point: Point, selected: boolean) {
  context.save()
  context.translate(point.x, point.y)
  context.rotate(Math.PI / 4)
  context.fillStyle = '#0b1923'
  context.strokeStyle = selected ? '#f6c453' : '#bee6e0'
  context.lineWidth = selected ? 3 : 2
  context.shadowColor = selected ? 'rgba(246,196,83,.55)' : 'transparent'
  context.shadowBlur = selected ? 16 : 0
  context.beginPath()
  context.roundRect(-9, -9, 18, 18, 4)
  context.fill()
  context.stroke()
  context.rotate(-Math.PI / 4)
  context.strokeStyle = '#bee6e0'
  context.lineWidth = 2
  context.beginPath()
  context.arc(0, 0, 3, 0, Math.PI * 2)
  context.stroke()
  context.restore()
}

function drawLink(context: CanvasRenderingContext2D, link: Link, a: Point, b: Point, showStress: boolean, highlighted: boolean) {
  const colors = materialColors[link.material]
  const stress = clamp(link.tension / 100, 0, 1)
  const stroke = showStress
    ? `rgb(${Math.round(190 + 65 * stress)} ${Math.round(230 - 105 * stress)} ${Math.round(224 - 115 * stress)})`
    : colors.stroke
  const width = link.material === 'chain' ? 3.1 : link.material === 'elastic' ? 3.8 : 2.8

  context.save()
  context.globalAlpha = highlighted ? 1 : 0.9
  context.strokeStyle = stroke
  context.lineWidth = highlighted ? width + 3 : width
  context.lineCap = 'round'
  context.shadowColor = highlighted ? `${colors.stroke}66` : 'transparent'
  context.shadowBlur = highlighted ? 18 : 0
  context.setLineDash(link.material === 'chain' ? [5, 7] : link.material === 'elastic' ? [2, 7] : [])
  context.beginPath()
  context.moveTo(a.x, a.y)
  context.lineTo(b.x, b.y)
  context.stroke()
  if (link.material === 'elastic') {
    context.setLineDash([])
    context.strokeStyle = `${colors.accent}55`
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(a.x, a.y)
    context.lineTo(b.x, b.y)
    context.stroke()
  }
  context.restore()
}

function drawWorld(context: CanvasRenderingContext2D, world: ConstraintWorld, config: PhysicsConfig, selectedId: number | null, hoverId: number | null, running: boolean, showGuides: boolean) {
  const { width, height } = world
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#0a1721'
  context.fillRect(0, 0, width, height)

  if (showGuides) {
    context.save()
    context.strokeStyle = 'rgba(190,230,224,.065)'
    context.lineWidth = 1
    for (let x = 20; x < width; x += 40) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
    }
    for (let y = 20; y < height; y += 40) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.stroke()
    }
    context.strokeStyle = 'rgba(190,230,224,.12)'
    context.setLineDash([4, 10])
    context.beginPath()
    context.moveTo(width / 2, 0)
    context.lineTo(width / 2, height)
    context.stroke()
    context.restore()

    context.save()
    context.fillStyle = 'rgba(190,230,224,.11)'
    context.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText('Y / LOAD', 22, 32)
    context.fillText('X / SPAN', width - 80, height - 18)
    context.fillStyle = 'rgba(190,230,224,.07)'
    context.fillRect(18, height - 42, width - 36, 1)
    context.restore()
  }

  world.links.forEach((link) => {
    const a = world.getPoint(link.a)
    const b = world.getPoint(link.b)
    if (a && b) drawLink(context, link, a, b, config.showStress ?? false, link.a === selectedId || link.b === selectedId || link.a === hoverId || link.b === hoverId)
  })

  world.points.forEach((point) => {
    const selected = point.id === selectedId
    const hovered = point.id === hoverId
    if (point.pinned) {
      drawAnchor(context, point, selected || hovered)
      return
    }
    context.save()
    context.fillStyle = point.tint ?? '#d5f2ec'
    context.strokeStyle = selected ? '#f6c453' : '#17313a'
    context.lineWidth = selected ? 3 : 2
    context.shadowColor = selected || hovered ? `${point.tint ?? '#bee6e0'}aa` : 'transparent'
    context.shadowBlur = selected || hovered ? 22 : 0
    context.beginPath()
    context.arc(point.x, point.y, point.radius, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.fillStyle = '#0a1721'
    context.beginPath()
    context.arc(point.x - point.radius * 0.25, point.y - point.radius * 0.25, Math.max(2, point.radius * 0.18), 0, Math.PI * 2)
    context.fill()
    context.restore()
  })

  const windStrength = Math.abs(config.wind)
  if (windStrength > 0.5) {
    const direction = config.wind > 0 ? 1 : -1
    const startX = direction > 0 ? width - 190 : 190
    const endX = direction > 0 ? width - 80 : 80
    const y = 74
    context.save()
    context.strokeStyle = '#f08a5d'
    context.fillStyle = '#f08a5d'
    context.lineWidth = 2
    context.setLineDash([7, 7])
    context.beginPath()
    context.moveTo(startX, y)
    context.lineTo(endX, y)
    context.stroke()
    context.setLineDash([])
    context.beginPath()
    context.moveTo(endX, y)
    context.lineTo(endX - direction * 11, y - 7)
    context.lineTo(endX - direction * 11, y + 7)
    context.closePath()
    context.fill()
    context.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText(`WIND ${config.wind > 0 ? '+' : ''}${formatNumber(config.wind)}`, Math.min(startX, endX), y - 14)
    context.restore()
  }

  context.save()
  drawRoundedRect(context, 20, height - 82, 214, 28, 14)
  context.fillStyle = 'rgba(7,16,24,.82)'
  context.fill()
  context.strokeStyle = 'rgba(190,230,224,.12)'
  context.stroke()
  context.fillStyle = '#bee6e0'
  context.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.fillText(running ? 'LIVE SOLVER  /  DRAG TO DISTURB' : 'SOLVER PAUSED  /  INSPECT MODE', 34, height - 64)
  context.restore()
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef(new ConstraintWorld(WORLD_WIDTH, WORLD_HEIGHT))
  const animationRef = useRef<number | undefined>(undefined)
  const draggingRef = useRef<number | null>(null)
  const [activePresetId, setActivePresetId] = useState('suspension')
  const [config, setConfig] = useState<PhysicsConfig>(DEFAULT_CONFIG)
  const [material, setMaterial] = useState<Material>('rope')
  const [mode, setMode] = useState<ToolMode>('select')
  const [running, setRunning] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [metrics, setMetrics] = useState<WorldMetrics>(EMPTY_METRICS)
  const [energyHistory, setEnergyHistory] = useState<number[]>([18, 19, 18.5, 20, 21, 20.5, 22, 21, 23, 22, 24, 22])
  const [events, setEvents] = useState<string[]>(['Suspension bridge loaded', 'Solver warm-up complete', 'Ready for interaction'])
  const [showGuides, setShowGuides] = useState(true)
  const [notice, setNotice] = useState('')

  const activePreset = getPreset(activePresetId)

  const addEvent = useCallback((message: string) => {
    setEvents((current) => [message, ...current].slice(0, 4))
  }, [])

  const loadPreset = useCallback((id: string) => {
    const preset = getPreset(id)
    const world = worldRef.current
    world.clear()
    preset.build(world)
    setActivePresetId(preset.id)
    setMaterial(preset.material)
    setSelectedId(null)
    setRunning(true)
    setNotice(`${preset.name} loaded`)
    setEvents((current) => [`${preset.name} loaded`, 'Preset topology rebuilt', ...current].slice(0, 4))
  }, [])

  useEffect(() => {
    loadPreset('suspension')
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [loadPreset])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.floor(bounds.width * pixelRatio))
      canvas.height = Math.max(1, Math.floor(bounds.height * pixelRatio))
      context.setTransform((canvas.width / bounds.width) || 1, 0, 0, (canvas.height / bounds.height) || 1, 0, 0)
    }
    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(canvas)

    let lastTime = performance.now()
    let lastMetricTime = 0
    const frame = (time: number) => {
      const delta = Math.min(0.034, Math.max(0.001, (time - lastTime) / 1000))
      lastTime = time
      const world = worldRef.current
      if (running) world.step(delta, config)
      drawWorld(context, world, config, selectedId, hoverId, running, showGuides)
      if (time - lastMetricTime > 130) {
        const nextMetrics = world.getMetrics(config)
        setMetrics(nextMetrics)
        setEnergyHistory((current) => [...current.slice(-28), Number(nextMetrics.energy.toFixed(2))])
        lastMetricTime = time
      }
      animationRef.current = requestAnimationFrame(frame)
    }
    animationRef.current = requestAnimationFrame(frame)

    return () => {
      observer.disconnect()
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [config, hoverId, running, selectedId, showGuides])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.code === 'Space') {
        event.preventDefault()
        setRunning((value) => !value)
      }
      if (event.key.toLowerCase() === 'r') loadPreset(activePresetId)
      if (event.key.toLowerCase() === 'c') setMode('cut')
      const numeric = Number(event.key)
      if (numeric >= 1 && numeric <= PRESETS.length) loadPreset(PRESETS[numeric - 1].id)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activePresetId, loadPreset])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const updateConfig = (key: keyof PhysicsConfig, value: number) => setConfig((current) => ({ ...current, [key]: value }))

  const worldPointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }
    const bounds = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * WORLD_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * WORLD_HEIGHT,
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = worldPointFromEvent(event)
    const world = worldRef.current
    if (mode === 'cut') {
      const cut = world.cutLinkAt(point.x, point.y)
      if (cut) {
        addEvent(`${materialLabel[cut.material]} constraint cut`)
        setNotice('Constraint cut')
      } else {
        setNotice('Aim at a constraint to cut')
      }
      return
    }
    if (mode === 'anchor') {
      const id = world.addPoint(point.x, point.y, { pinned: true, radius: 11, label: 'user anchor' })
      setSelectedId(id)
      addEvent('Anchor point added')
      setNotice('Anchor added')
      return
    }
    if (mode === 'mass') {
      const id = world.addPoint(point.x, point.y, { mass: 3, radius: 15, tint: '#f08a5d' })
      const nearest = world.findPointAt(point.x, point.y, 160)
      if (nearest && nearest.id !== id) world.addLink(nearest.id, id, { material, stiffness: 0.9 })
      setSelectedId(id)
      addEvent(`${materialLabel[material]} mass attached`)
      setNotice('Mass attached')
      return
    }
    const nearest = world.findPointAt(point.x, point.y)
    if (!nearest) {
      setSelectedId(null)
      return
    }
    setSelectedId(nearest.id)
    if (!nearest.pinned) {
      draggingRef.current = nearest.id
      event.currentTarget.setPointerCapture(event.pointerId)
      setRunning(false)
      addEvent(`${nearest.label ?? 'Mass'} grabbed`)
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = worldPointFromEvent(event)
    const world = worldRef.current
    const nearest = world.findPointAt(point.x, point.y)
    setHoverId(nearest?.id ?? null)
    if (draggingRef.current !== null) world.dragPoint(draggingRef.current, point.x, point.y)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current !== null) {
      draggingRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      setRunning(true)
      addEvent('Mass released into solver')
    }
  }

  const selectedPoint = selectedId ? worldRef.current.getPoint(selectedId) : undefined
  const selectedLinks = selectedId ? worldRef.current.links.filter((link) => link.a === selectedId || link.b === selectedId) : []

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Link2 size={18} strokeWidth={2.5} /></div>
          <div>
            <div className="brand-name">TETHERWORKS</div>
            <div className="brand-subtitle">CONSTRAINT LAB <span>/</span> STARDANCE</div>
          </div>
        </div>
        <div className="topbar-middle"><span className="status-pip" /> LOCAL SIMULATION <span className="topbar-divider" /> v0.1 / VERLET CORE</div>
        <div className="topbar-actions">
          <a href="https://github.com/costachestefy90-source/tetherworks-constraint-lab" target="_blank" rel="noreferrer" className="topbar-link"><Github size={15} /> Source</a>
          <button className="icon-button" aria-label="Project info" title="Project info"><Info size={17} /></button>
          <div className="avatar">S</div>
        </div>
      </header>

      <main className="workspace-grid">
        <aside className="left-panel panel-surface">
          <div className="panel-heading"><div><span className="section-kicker">EXPERIMENT DECK</span><h2>Presets</h2></div><span className="count-pill">07</span></div>
          <div className="preset-list">
            {PRESETS.map((preset) => <PresetCard key={preset.id} preset={preset} active={preset.id === activePresetId} onClick={() => loadPreset(preset.id)} />)}
          </div>
          <div className="left-footer">
            <div className="mini-callout"><Sparkles size={15} /><span><strong>Tip</strong> Cut any line while paused to inspect how the load path reroutes.</span></div>
            <div className="shortcut-row"><span><kbd>SPACE</kbd> play/pause</span><span><kbd>R</kbd> reset</span></div>
          </div>
        </aside>

        <section className="stage-column">
          <div className="stage-header">
            <div><div className="section-kicker">ACTIVE STUDY <span className="study-id">/{activePreset.eyebrow.split('/')[1]?.trim()}</span></div><h1>{activePreset.name}</h1></div>
            <div className="stage-header-meta"><span className="simulation-badge"><span className="status-pip" />{running ? 'SIMULATING' : 'INSPECTING'}</span><span className="step-readout">STEP {formatNumber(worldRef.current.stepCount, 0)}</span></div>
          </div>

          <div className="canvas-card">
            <div className="canvas-topline">
              <div className="canvas-legend"><span className="legend-item"><i className="legend-line rope-line" /> rope</span><span className="legend-item"><i className="legend-line chain-line" /> chain</span><span className="legend-item"><i className="legend-line elastic-line" /> elastic</span></div>
              <div className="canvas-readout"><span>FIELD {WORLD_WIDTH} × {WORLD_HEIGHT}</span><span className="readout-divider" /><span>{formatNumber(worldRef.current.points.length)} NODES</span></div>
            </div>
            <div className="canvas-wrap">
              <canvas ref={canvasRef} className="simulation-canvas" aria-label="Interactive constraint physics simulation" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={() => setHoverId(null)} />
              <div className="canvas-corner top-left"><span className="corner-label">LIVE / {materialLabel[material].toUpperCase()}</span><span className="corner-coords">{selectedPoint ? `SELECTED · ${selectedPoint.id.toString().padStart(2, '0')}` : 'NO SELECTION'}</span></div>
              <div className="canvas-corner bottom-right"><span className="corner-label">G {formatNumber(config.gravity)} · W {config.wind > 0 ? '+' : ''}{formatNumber(config.wind)}</span><span className="corner-coords">DAMP {Math.round(config.damping * 100)}%</span></div>
            </div>
            <div className="canvas-toolbar">
              <div className="tool-group">
                <button className={`tool-button primary-tool ${mode === 'select' ? 'is-active' : ''}`} onClick={() => setMode('select')} title="Select and drag masses"><MousePointer2 size={16} /> Select</button>
                <button className={`tool-button ${mode === 'anchor' ? 'is-active' : ''}`} onClick={() => setMode('anchor')} title="Add a pinned anchor"><Anchor size={16} /> Anchor</button>
                <button className={`tool-button ${mode === 'mass' ? 'is-active' : ''}`} onClick={() => setMode('mass')} title="Add a mass"><Plus size={16} /> Mass</button>
                <button className={`tool-button danger-tool ${mode === 'cut' ? 'is-active' : ''}`} onClick={() => setMode('cut')} title="Cut a constraint"><Scissors size={16} /> Cut</button>
              </div>
              <div className="canvas-actions">
                <button className="tool-button play-button" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={15} /> : <Play size={15} />} {running ? 'Pause' : 'Play'}</button>
                <button className="round-button" onClick={() => loadPreset(activePresetId)} aria-label="Reset current preset" title="Reset current preset"><RotateCcw size={16} /></button>
              </div>
            </div>
          </div>

          <div className="telemetry-grid">
            <Metric label="System energy" value={`${formatNumber(metrics.energy, 1)} J`} note="rolling total" tone="gold" icon={<Zap size={15} />} />
            <Metric label="Peak tension" value={`${formatNumber(metrics.maxTension)}%`} note="highest link load" tone="coral" icon={<Activity size={15} />} />
            <Metric label="Stability" value={`${formatNumber(metrics.stability)}%`} note={metrics.stability > 78 ? 'inside safe band' : 'watch the redline'} tone={metrics.stability > 78 ? 'mint' : 'coral'} icon={<CircleGauge size={15} />} />
            <div className="metric-card energy-card"><div className="metric-topline"><span className="metric-label">Energy trace</span><span className="trace-live">LIVE</span></div><Sparkline values={energyHistory} /><div className="metric-note">last 30 samples</div></div>
          </div>
        </section>

        <aside className="right-panel panel-surface">
          <div className="inspector-heading"><div><span className="section-kicker">INSTRUMENT PANEL</span><h2>Controls</h2></div><Settings2 size={17} /></div>

          <section className="control-section">
            <div className="control-section-title"><span>Environment</span><Wind size={15} /></div>
            <SliderRow label="Gravity" value={config.gravity} min={0} max={220} step={1} display={`${formatNumber(config.gravity)} px/s²`} onChange={(value) => updateConfig('gravity', value)} hint="downward field" />
            <SliderRow label="Wind" value={config.wind} min={-100} max={100} step={1} display={`${config.wind > 0 ? '+' : ''}${formatNumber(config.wind)}`} onChange={(value) => updateConfig('wind', value)} hint="horizontal gust" />
          </section>

          <section className="control-section">
            <div className="control-section-title"><span>Material response</span><SlidersHorizontal size={15} /></div>
            <div className="material-switcher" role="group" aria-label="Constraint material">
              {(['rope', 'chain', 'elastic'] as Material[]).map((option) => <button key={option} className={material === option ? 'is-active' : ''} onClick={() => { setMaterial(option); worldRef.current.setMaterial(option); addEvent(`${materialLabel[option]} behavior applied`) }}><span className={`material-swatch ${option}`} />{materialLabel[option]}</button>)}
            </div>
            <SliderRow label="Stiffness" value={config.stiffness} min={0.35} max={1.25} step={0.01} display={`${Math.round(config.stiffness * 100)}%`} onChange={(value) => updateConfig('stiffness', value)} hint="constraint correction" />
            <SliderRow label="Damping" value={config.damping} min={0.82} max={0.995} step={0.005} display={`${Math.round(config.damping * 100)}%`} onChange={(value) => updateConfig('damping', value)} hint="motion decay" />
            <SliderRow label="Solver passes" value={config.solverPasses} min={3} max={12} step={1} display={`${config.solverPasses}`} onChange={(value) => updateConfig('solverPasses', value)} hint="iterations / frame" />
          </section>

          <section className="control-section visual-section">
            <div className="control-section-title"><span>Visualization</span><Crosshair size={15} /></div>
            <label className="toggle-row"><span><span className="toggle-title">Stress colors</span><span className="toggle-description">Map tension along each link</span></span><input type="checkbox" checked={Boolean(config.showStress)} onChange={(event) => setConfig((current) => ({ ...current, showStress: event.target.checked }))} /><span className="toggle-control" /></label>
            <label className="toggle-row"><span><span className="toggle-title">Field guides</span><span className="toggle-description">Grid, axes, and labels</span></span><input type="checkbox" checked={showGuides} onChange={(event) => setShowGuides(event.target.checked)} /><span className="toggle-control" /></label>
          </section>

          <section className="selection-section">
            <div className="selection-title"><span>Selection</span><span className="selection-status">{selectedPoint ? 'ACTIVE' : 'IDLE'}</span></div>
            {selectedPoint ? <div className="selection-card"><div className="selection-main"><div className="selection-avatar">{selectedPoint.pinned ? <Anchor size={16} /> : <CircleDot size={16} />}</div><div><strong>{selectedPoint.pinned ? 'Anchor point' : 'Mass node'}</strong><span>NODE / {selectedPoint.id.toString().padStart(2, '0')}</span></div></div><div className="selection-grid"><span>mass <b>{formatNumber(selectedPoint.mass, 1)} kg</b></span><span>links <b>{selectedLinks.length}</b></span><span>x <b>{formatNumber(selectedPoint.x)}</b></span><span>y <b>{formatNumber(selectedPoint.y)}</b></span></div></div> : <div className="empty-selection"><MousePointer2 size={16} /><span>Click a mass or anchor<br /><small>Drag a mass to disturb the field</small></span></div>}
          </section>

          <section className="activity-section">
            <div className="selection-title"><span>Activity</span><span className="selection-status">{events.length.toString().padStart(2, '0')} EVENTS</span></div>
            <div className="activity-list">{events.map((event, index) => <div className="activity-row" key={`${event}-${index}`}><span className={`activity-marker ${index === 0 ? 'is-current' : ''}`} /><span>{event}</span><time>{index === 0 ? 'now' : `${index * 2}m`}</time></div>)}</div>
          </section>

          <div className="right-footer"><div className="footer-icon"><Code2 size={15} /></div><span><strong>Static front-end build</strong><br />Canvas + TypeScript / no backend</span></div>
        </aside>
      </main>

      <footer className="app-footer"><div><span className="footer-mark"><Grip size={13} /></span> TETHERWORKS / CONSTRAINT LAB</div><div className="footer-center"><span>BUILT FOR CURIOUS HANDS</span><span className="footer-divider" /><span>STATIC / GITHUB PAGES READY</span></div><div className="footer-right"><span className="footer-live-dot" /> {running ? 'SOLVER ONLINE' : 'SOLVER PAUSED'}</div></footer>
      {notice ? <div className="toast"><span className="toast-pip" />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button></div> : null}
    </div>
  )
}
