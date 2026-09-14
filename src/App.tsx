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
  Undo2,
  Wind,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { ConstraintWorld, Link, Material, PhysicsConfig, Point, WorldMetrics, WorldSnapshot, materialLabel } from './physics'
import { getPreset, PRESETS, PresetDefinition } from './presets'

type ToolMode = 'select' | 'anchor' | 'link' | 'mass' | 'cut'

const WORLD_WIDTH = 1000
const WORLD_HEIGHT = 620

const DEFAULT_CONFIG: PhysicsConfig = {
  gravity: 86,
  wind: 0,
  damping: 0.93,
  stiffness: 0.92,
  solverPasses: 8,
  breakTension: 0,
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

function drawWorld(context: CanvasRenderingContext2D, world: ConstraintWorld, config: PhysicsConfig, selectedId: number | null, hoverId: number | null, running: boolean, showGuides: boolean, showLabels: boolean, showCenterOfMass: boolean) {
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
    } else {
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
    }

    if (showLabels && (selected || hovered)) {
      const label = `${point.pinned ? 'ANCHOR' : 'MASS'} / ${point.id.toString().padStart(2, '0')}`
      context.save()
      context.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace'
      const labelWidth = context.measureText(label).width + 16
      const labelX = clamp(point.x + point.radius + 10, 12, width - labelWidth - 12)
      const labelY = clamp(point.y - point.radius - 26, 12, height - 40)
      drawRoundedRect(context, labelX, labelY, labelWidth, 22, 6)
      context.fillStyle = 'rgba(7,16,24,.9)'
      context.fill()
      context.strokeStyle = selected ? 'rgba(246,196,83,.58)' : 'rgba(190,230,224,.25)'
      context.lineWidth = 1
      context.stroke()
      context.fillStyle = selected ? '#f6c453' : '#bee6e0'
      context.fillText(label, labelX + 8, labelY + 14)
      context.restore()
    }
  })

  if (showCenterOfMass && world.points.length) {
    let totalMass = 0
    let centerX = 0
    let centerY = 0
    world.points.forEach((point) => {
      totalMass += point.mass
      centerX += point.x * point.mass
      centerY += point.y * point.mass
    })
    if (totalMass > 0) {
      centerX /= totalMass
      centerY /= totalMass
      context.save()
      context.strokeStyle = 'rgba(190,230,224,.72)'
      context.fillStyle = 'rgba(190,230,224,.95)'
      context.lineWidth = 1
      context.setLineDash([3, 5])
      context.beginPath()
      context.arc(centerX, centerY, 15, 0, Math.PI * 2)
      context.stroke()
      context.setLineDash([])
      context.beginPath()
      context.moveTo(centerX - 23, centerY)
      context.lineTo(centerX + 23, centerY)
      context.moveTo(centerX, centerY - 23)
      context.lineTo(centerX, centerY + 23)
      context.stroke()
      context.beginPath()
      context.arc(centerX, centerY, 3, 0, Math.PI * 2)
      context.fill()
      context.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillText('CENTER OF MASS', clamp(centerX + 20, 12, width - 112), clamp(centerY - 19, 14, height - 44))
      context.restore()
    }
  }

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
  const undoStackRef = useRef<WorldSnapshot[]>([])
  const [activePresetId, setActivePresetId] = useState('suspension')
  const [config, setConfig] = useState<PhysicsConfig>(DEFAULT_CONFIG)
  const [material, setMaterial] = useState<Material>('rope')
  const [mode, setMode] = useState<ToolMode>('select')
  const [linkStartId, setLinkStartId] = useState<number | null>(null)
  const [segmentCount, setSegmentCount] = useState(6)
  const [running, setRunning] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [undoCount, setUndoCount] = useState(0)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [metrics, setMetrics] = useState<WorldMetrics>(EMPTY_METRICS)
  const [energyHistory, setEnergyHistory] = useState<number[]>([18, 19, 18.5, 20, 21, 20.5, 22, 21, 23, 22, 24, 22])
  const [events, setEvents] = useState<string[]>(['Suspension bridge loaded', 'Solver warm-up complete', 'Ready for interaction'])
  const [, setSelectionTick] = useState(0)
  const [showGuides, setShowGuides] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [showCenterOfMass, setShowCenterOfMass] = useState(false)
  const [notice, setNotice] = useState('')
  const [showInfo, setShowInfo] = useState(false)

  const activePreset = getPreset(activePresetId)

  const addEvent = useCallback((message: string) => {
    setEvents((current) => [message, ...current].slice(0, 4))
  }, [])

  const saveUndo = useCallback((snapshot: WorldSnapshot) => {
    undoStackRef.current = [...undoStackRef.current.slice(-19), snapshot]
    setUndoCount(undoStackRef.current.length)
  }, [])

  const loadPreset = useCallback((id: string) => {
    const preset = getPreset(id)
    const world = worldRef.current
    world.clear()
    preset.build(world)
    setActivePresetId(preset.id)
    setMaterial(preset.material)
    setSelectedId(null)
    setLinkStartId(null)
    undoStackRef.current = []
    setUndoCount(0)
    setRunning(true)
    setNotice(`${preset.name} loaded`)
    setEvents((current) => [`${preset.name} loaded`, 'Preset topology rebuilt', ...current].slice(0, 4))
  }, [])

  const undoLast = useCallback(() => {
    const snapshot = undoStackRef.current.pop()
    if (!snapshot) {
      setNotice('Nothing to undo')
      return
    }
    const world = worldRef.current
    world.restore(snapshot)
    setUndoCount(undoStackRef.current.length)
    setLinkStartId(null)
    setSelectedId((current) => current !== null && world.getPoint(current) ? current : null)
    setMetrics(world.getMetrics(config))
    setRunning(false)
    addEvent('Last topology edit undone')
    setNotice('Last edit undone')
  }, [addEvent, config])

  const nudgeSelected = useCallback(() => {
    const point = selectedId === null ? undefined : worldRef.current.getPoint(selectedId)
    if (!point) {
      setNotice('Select a movable mass first')
      return
    }
    if (point.pinned) {
      setNotice('Pinned anchors cannot be nudged')
      return
    }
    const direction = point.x < WORLD_WIDTH / 2 ? 1 : -1
    if (worldRef.current.applyImpulse(point.id, direction * 145, -105)) {
      setRunning(true)
      addEvent(`${point.label ?? 'Mass'} nudged into motion`)
      setNotice('Impulse applied')
    }
  }, [addEvent, selectedId])

  const toggleSelectedPin = useCallback(() => {
    const point = selectedId === null ? undefined : worldRef.current.getPoint(selectedId)
    if (!point) {
      setNotice('Select a node to pin or release')
      return
    }
    const nextPinned = !point.pinned
    const before = worldRef.current.snapshot()
    if (worldRef.current.setPinned(point.id, nextPinned)) {
      saveUndo(before)
      setSelectionTick((value) => value + 1)
      setRunning(false)
      addEvent(nextPinned ? 'Mass pinned as an anchor' : 'Anchor released as a mass')
      setNotice(nextPinned ? 'Node pinned' : 'Anchor released')
    }
  }, [addEvent, saveUndo, selectedId])

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
      const brokenLinks = running ? world.step(delta, config) : []
      if (brokenLinks.length) {
        addEvent(`${brokenLinks.length} constraint${brokenLinks.length === 1 ? '' : 's'} failed at the redline`)
        setNotice(`${brokenLinks.length} constraint${brokenLinks.length === 1 ? '' : 's'} failed`)
      }
      drawWorld(context, world, config, selectedId, hoverId, running, showGuides, showLabels, showCenterOfMass)
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
  }, [addEvent, config, hoverId, running, selectedId, showCenterOfMass, showGuides, showLabels])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'Escape') {
        setShowInfo(false)
        setLinkStartId(null)
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        setRunning((value) => !value)
      }
      if (event.key.toLowerCase() === 'r') loadPreset(activePresetId)
      if (event.key.toLowerCase() === 'c') setMode('cut')
      if (event.key.toLowerCase() === 'l') setShowLabels((value) => !value)
      if (event.key.toLowerCase() === 'k') nudgeSelected()
      if (event.key.toLowerCase() === 'p') toggleSelectedPin()
      if (event.key.toLowerCase() === 'u') undoLast()
      const numeric = Number(event.key)
      if (numeric >= 1 && numeric <= PRESETS.length) loadPreset(PRESETS[numeric - 1].id)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activePresetId, loadPreset, nudgeSelected, toggleSelectedPin, undoLast])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const updateConfig = (key: keyof PhysicsConfig, value: number) => setConfig((current) => ({ ...current, [key]: value }))
  const chooseMode = (nextMode: ToolMode) => {
    setMode(nextMode)
    setLinkStartId(null)
  }

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
      const before = world.snapshot()
      const cut = world.cutLinkAt(point.x, point.y)
      if (cut) {
        saveUndo(before)
        addEvent(`${materialLabel[cut.material]} constraint cut`)
        setNotice('Constraint cut')
      } else {
        setNotice('Aim at a constraint to cut')
      }
      return
    }
    if (mode === 'link') {
      const nearest = world.findPointAt(point.x, point.y, 160)
      if (!nearest) {
        setNotice('Select a node to connect')
        return
      }
      if (linkStartId === null) {
        setLinkStartId(nearest.id)
        setSelectedId(nearest.id)
        addEvent(`${nearest.label ?? 'Node'} selected as link start`)
        setNotice('Select a second node')
      } else if (nearest.id === linkStartId) {
        setNotice('Choose a different node')
      } else {
        const before = world.snapshot()
        const linkId = world.addLink(linkStartId, nearest.id, { material, stiffness: config.stiffness })
        if (linkId === null) {
          setNotice('Those nodes are already connected')
          return
        }
        saveUndo(before)
        setSelectedId(nearest.id)
        setLinkStartId(null)
        addEvent(`${materialLabel[material]} constraint connected`)
        setNotice('Constraint connected')
      }
      return
    }
    if (mode === 'anchor') {
      const before = world.snapshot()
      const id = world.addPoint(point.x, point.y, { pinned: true, radius: 11, label: 'user anchor' })
      saveUndo(before)
      setSelectedId(id)
      addEvent('Anchor point added')
      setNotice('Anchor added')
      return
    }
    if (mode === 'mass') {
      const before = world.snapshot()
      const nearest = world.findPointAt(point.x, point.y, 160)
      if (nearest) {
        let previousId = nearest.id
        for (let index = 1; index <= segmentCount; index += 1) {
          const progress = index / segmentCount
          const id = world.addPoint(
            nearest.x + (point.x - nearest.x) * progress,
            nearest.y + (point.y - nearest.y) * progress,
            { mass: index === segmentCount ? 3 : 0.8, radius: index === segmentCount ? 15 : 6, tint: index === segmentCount ? '#f08a5d' : '#bee6e0' },
          )
          world.addLink(previousId, id, { material, stiffness: 0.9 })
          previousId = id
        }
        setSelectedId(previousId)
        addEvent(`${materialLabel[material]} mass attached · ${segmentCount} segments`)
        setNotice(`Mass attached / ${segmentCount} segments`)
      } else {
        const id = world.addPoint(point.x, point.y, { mass: 3, radius: 15, tint: '#f08a5d' })
        setSelectedId(id)
        addEvent(`${materialLabel[material]} mass added`)
        setNotice('Mass added')
      }
      saveUndo(before)
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
  const selectedSpeed = selectedPoint ? Math.hypot((selectedPoint.x - selectedPoint.oldX) * 60, (selectedPoint.y - selectedPoint.oldY) * 60) : 0
  const selectedLoad = selectedLinks.length ? Math.max(...selectedLinks.map((link) => link.tension)) : 0
  const updateSelectedMass = (value: number) => {
    if (!selectedPoint || selectedPoint.pinned) return
    selectedPoint.mass = value
    setSelectionTick((current) => current + 1)
  }
  const interactionGuide = useMemo(() => {
    if (mode === 'anchor') return { label: 'ANCHOR MODE', text: 'Click anywhere in the field to add a fixed point.' }
    if (mode === 'link') {
      return linkStartId === null
        ? { label: 'LINK MODE', text: 'Click a node, then click another node to connect them.' }
        : { label: 'LINK MODE / STEP 2', text: 'Choose a second node to finish the constraint.' }
    }
    if (mode === 'mass') return { label: 'MASS MODE', text: 'Click near a node to grow a segmented attachment, or click empty space for a new mass.' }
    if (mode === 'cut') return { label: 'CUT MODE', text: 'Click a line to remove it and watch the load path reroute.' }
    return running
      ? { label: 'SELECT MODE', text: 'Drag a glowing mass to pause, inspect, and reshape the study.' }
      : { label: 'INSPECT MODE', text: 'Click a node to tune its mass, pin it, or give it a quick nudge.' }
  }, [linkStartId, mode, running])

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
        <div className="topbar-middle"><span className="status-pip" /> LOCAL SIMULATION <span className="topbar-divider" /> v0.2 / VERLET CORE</div>
        <div className="topbar-actions">
          <a href="https://github.com/costachestefy90-source/tetherworks-constraint-lab" target="_blank" rel="noreferrer" className="topbar-link"><Github size={15} /> Source</a>
          <button className="icon-button" aria-label="Project info" aria-expanded={showInfo} title="Project info" onClick={() => setShowInfo(true)}><Info size={17} /></button>
          <div className="avatar">S</div>
        </div>
      </header>

      <main className="workspace-grid">
        <aside className="left-panel panel-surface">
          <div className="panel-heading"><div><span className="section-kicker">EXPERIMENT DECK</span><h2>Presets</h2></div><span className="count-pill">{PRESETS.length.toString().padStart(2, '0')}</span></div>
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
              <div className="canvas-readout"><span>FIELD {WORLD_WIDTH} × {WORLD_HEIGHT}</span><span className="readout-divider" /><span>{formatNumber(worldRef.current.points.length)} NODES</span><span className="readout-divider" /><span>{formatNumber(worldRef.current.links.length)} LINKS</span></div>
            </div>
            <div className="canvas-wrap">
              <canvas ref={canvasRef} className="simulation-canvas" aria-label="Interactive constraint physics simulation" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={() => setHoverId(null)} />
              <div className="canvas-corner top-left"><span className="corner-label">LIVE / {materialLabel[material].toUpperCase()}</span><span className="corner-coords">{selectedPoint ? `SELECTED · ${selectedPoint.id.toString().padStart(2, '0')}` : 'NO SELECTION'}</span></div>
              <div className="canvas-corner bottom-right"><span className="corner-label">G {formatNumber(config.gravity)} · W {config.wind > 0 ? '+' : ''}{formatNumber(config.wind)}</span><span className="corner-coords">DAMP {Math.round(config.damping * 100)}% · {config.breakTension ? `REDLINE ${formatNumber(config.breakTension)}%` : 'REDLINE OFF'}</span></div>
            </div>
            <div className="canvas-toolbar">
              <div className="tool-group">
                <button className={`tool-button primary-tool ${mode === 'select' ? 'is-active' : ''}`} aria-pressed={mode === 'select'} onClick={() => chooseMode('select')} title="Select and drag masses"><MousePointer2 size={16} /> Select</button>
                <button className={`tool-button ${mode === 'anchor' ? 'is-active' : ''}`} aria-pressed={mode === 'anchor'} onClick={() => chooseMode('anchor')} title="Add a pinned anchor"><Anchor size={16} /> Anchor</button>
                <button className={`tool-button ${mode === 'link' ? 'is-active' : ''}`} aria-pressed={mode === 'link'} onClick={() => chooseMode('link')} title="Connect two nodes"><Link2 size={16} /> Link</button>
                <button className={`tool-button ${mode === 'mass' ? 'is-active' : ''}`} aria-pressed={mode === 'mass'} onClick={() => chooseMode('mass')} title="Add a mass"><Plus size={16} /> Mass</button>
                <button className={`tool-button danger-tool ${mode === 'cut' ? 'is-active' : ''}`} aria-pressed={mode === 'cut'} onClick={() => chooseMode('cut')} title="Cut a constraint"><Scissors size={16} /> Cut</button>
              </div>
              <div className="canvas-actions">
                <button className="tool-button play-button" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={15} /> : <Play size={15} />} {running ? 'Pause' : 'Play'}</button>
                <button className="round-button" onClick={undoLast} disabled={undoCount === 0} aria-label="Undo last edit" title={undoCount ? 'Undo last edit' : 'No edits to undo'}><Undo2 size={16} /></button>
                <button className="round-button" onClick={() => loadPreset(activePresetId)} aria-label="Reset current preset" title="Reset current preset"><RotateCcw size={16} /></button>
              </div>
            </div>
            <div className="interaction-guide" aria-live="polite">
              <div className="guide-icon"><Wrench size={14} /></div>
              <div className="guide-copy"><span className="guide-kicker">HOW TO PLAY / {interactionGuide.label}</span><span>{interactionGuide.text}</span></div>
              <button className="guide-link" onClick={() => setShowInfo(true)} title="Open the full quick-start guide">Guide <ChevronRight size={13} /></button>
            </div>
          </div>

          <div className="telemetry-grid">
            <Metric label="System energy" value={`${formatNumber(metrics.energy, 1)} J`} note="rolling total" tone="gold" icon={<Zap size={15} />} />
            <Metric label="Peak tension" value={`${formatNumber(metrics.maxTension)}%`} note="highest link load" tone="coral" icon={<Activity size={15} />} />
            <Metric label="Stability" value={`${formatNumber(metrics.stability)}%`} note={metrics.stability > 78 ? 'inside safe band' : 'watch the redline'} tone={metrics.stability > 78 ? 'mint' : 'coral'} icon={<CircleGauge size={15} />} />
            <Metric label="Center of mass" value={`${formatNumber(metrics.centerOfMass.x)} / ${formatNumber(metrics.centerOfMass.y)}`} note="weighted field position" tone="mint" icon={<Compass size={15} />} />
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
              {(['rope', 'chain', 'elastic'] as Material[]).map((option) => <button key={option} className={material === option ? 'is-active' : ''} aria-pressed={material === option} onClick={() => { if (material === option) return; const before = worldRef.current.snapshot(); setMaterial(option); worldRef.current.setMaterial(option); saveUndo(before); addEvent(`${materialLabel[option]} behavior applied`) }}><span className={`material-swatch ${option}`} />{materialLabel[option]}</button>)}
            </div>
            <SliderRow label="Stiffness" value={config.stiffness} min={0.35} max={1.25} step={0.01} display={`${Math.round(config.stiffness * 100)}%`} onChange={(value) => updateConfig('stiffness', value)} hint="constraint correction" />
            <SliderRow label="Damping" value={config.damping} min={0.82} max={0.995} step={0.005} display={`${Math.round(config.damping * 100)}%`} onChange={(value) => updateConfig('damping', value)} hint="motion decay" />
            <SliderRow label="Solver passes" value={config.solverPasses} min={3} max={12} step={1} display={`${config.solverPasses}`} onChange={(value) => updateConfig('solverPasses', value)} hint="iterations / frame" />
            <SliderRow label="Segment count" value={segmentCount} min={3} max={14} step={1} display={`${segmentCount}`} onChange={setSegmentCount} hint="detail for new masses" />
          </section>

          <section className="control-section visual-section">
            <div className="control-section-title"><span>Visualization</span><Crosshair size={15} /></div>
            <label className="toggle-row"><span><span className="toggle-title">Stress colors</span><span className="toggle-description">Map tension along each link</span></span><input type="checkbox" checked={Boolean(config.showStress)} onChange={(event) => setConfig((current) => ({ ...current, showStress: event.target.checked }))} /><span className="toggle-control" /></label>
            <label className="toggle-row"><span><span className="toggle-title">Field guides</span><span className="toggle-description">Grid, axes, and labels</span></span><input type="checkbox" checked={showGuides} onChange={(event) => setShowGuides(event.target.checked)} /><span className="toggle-control" /></label>
            <label className="toggle-row"><span><span className="toggle-title">Focus labels</span><span className="toggle-description">Show IDs on hovered nodes</span></span><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} /><span className="toggle-control" /></label>
            <label className="toggle-row"><span><span className="toggle-title">Center marker</span><span className="toggle-description">Plot the weighted center of mass</span></span><input type="checkbox" checked={showCenterOfMass} onChange={(event) => setShowCenterOfMass(event.target.checked)} /><span className="toggle-control" /></label>
            <label className="toggle-row"><span><span className="toggle-title">Failure redline</span><span className="toggle-description">Automatically break overloaded links</span></span><input type="checkbox" checked={(config.breakTension ?? 0) > 0} onChange={(event) => setConfig((current) => ({ ...current, breakTension: event.target.checked ? 86 : 0 }))} /><span className="toggle-control" /></label>
            {(config.breakTension ?? 0) > 0 ? <SliderRow label="Failure threshold" value={config.breakTension ?? 86} min={45} max={100} step={1} display={`${formatNumber(config.breakTension ?? 86)}%`} onChange={(value) => updateConfig('breakTension', value)} hint="link load before failure" /> : null}
          </section>

          <section className="selection-section">
            <div className="selection-title"><span>Selection</span><span className="selection-status">{selectedPoint ? 'ACTIVE' : 'IDLE'}</span></div>
            {selectedPoint ? <div className="selection-card"><div className="selection-main"><div className="selection-avatar">{selectedPoint.pinned ? <Anchor size={16} /> : <CircleDot size={16} />}</div><div><strong>{selectedPoint.pinned ? 'Anchor point' : 'Mass node'}</strong><span>NODE / {selectedPoint.id.toString().padStart(2, '0')}</span></div><div className="selection-actions"><button className="selection-action" onClick={nudgeSelected} disabled={selectedPoint.pinned} title={selectedPoint.pinned ? 'Pinned anchors cannot be nudged' : 'Apply a quick impulse'}><Zap size={13} /> Nudge</button><button className="selection-action secondary-action" onClick={toggleSelectedPin} title={selectedPoint.pinned ? 'Release this anchor' : 'Pin this mass'}><Anchor size={13} /> {selectedPoint.pinned ? 'Release' : 'Pin'}</button></div></div><div className="selection-grid"><span>mass <b>{formatNumber(selectedPoint.mass, 1)} kg</b></span><span>links <b>{selectedLinks.length}</b></span><span>speed <b>{formatNumber(selectedSpeed)} px/s</b></span><span>peak load <b>{formatNumber(selectedLoad)}%</b></span><span>x <b>{formatNumber(selectedPoint.x)}</b></span><span>y <b>{formatNumber(selectedPoint.y)}</b></span></div>{!selectedPoint.pinned ? <div className="selection-tune"><SliderRow label="Mass weight" value={selectedPoint.mass} min={0.5} max={12} step={0.1} display={`${formatNumber(selectedPoint.mass, 1)} kg`} onChange={updateSelectedMass} hint="live node mass" /></div> : null}</div> : <div className="empty-selection"><MousePointer2 size={16} /><span>Click a mass or anchor<br /><small>Drag · K nudge · P pin / release</small></span></div>}
          </section>

          <section className="activity-section">
            <div className="selection-title"><span>Activity</span><span className="selection-status">{events.length.toString().padStart(2, '0')} EVENTS</span></div>
            <div className="activity-list">{events.map((event, index) => <div className="activity-row" key={`${event}-${index}`}><span className={`activity-marker ${index === 0 ? 'is-current' : ''}`} /><span>{event}</span><time>{index === 0 ? 'now' : `${index * 2}m`}</time></div>)}</div>
          </section>

          <div className="right-footer"><div className="footer-icon"><Code2 size={15} /></div><span><strong>Static front-end build</strong><br />Canvas + TypeScript / no backend</span></div>
        </aside>
      </main>

      <footer className="app-footer"><div><span className="footer-mark"><Grip size={13} /></span> TETHERWORKS / CONSTRAINT LAB</div><div className="footer-center"><span>BUILT FOR CURIOUS HANDS</span><span className="footer-divider" /><span>STATIC / GITHUB PAGES READY</span></div><div className="footer-right"><span className="footer-live-dot" /> {running ? 'SOLVER ONLINE' : 'SOLVER PAUSED'}</div></footer>
      {showInfo ? <div className="info-backdrop" onClick={() => setShowInfo(false)}><section className="info-modal panel-surface" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={(event) => event.stopPropagation()}><div className="info-modal-header"><div><span className="section-kicker">FIELD NOTES / TETHERWORKS</span><h2 id="info-title">How to run a study</h2></div><button className="round-button info-modal-close" onClick={() => setShowInfo(false)} aria-label="Close project info" title="Close"><X size={16} /></button></div><p className="info-modal-copy">Tetherworks is a small constraint laboratory. Pick a topology, disturb it, and read the response. Every node and link is simulated locally in the browser.</p><div className="info-grid"><div className="info-item"><span className="info-item-number">01</span><strong>Choose a study</strong><span>Seven presets cover bridges, pendulums, signs, springs, and cascades.</span></div><div className="info-item"><span className="info-item-number">02</span><strong>Build the topology</strong><span>Use Anchor, Link, Mass, and Cut directly on the field.</span></div><div className="info-item"><span className="info-item-number">03</span><strong>Stress the system</strong><span>Drag a mass, add wind, nudge it with K, or enable the failure redline.</span></div><div className="info-item"><span className="info-item-number">04</span><strong>Read the telemetry</strong><span>Energy, tension, stability, center marker, speed, and node load update as the solver runs.</span></div></div><div className="info-shortcuts"><span><kbd>SPACE</kbd> play / pause</span><span><kbd>R</kbd> reset</span><span><kbd>C</kbd> cut mode</span><span><kbd>L</kbd> labels</span><span><kbd>K</kbd> nudge</span><span><kbd>P</kbd> pin / release</span><span><kbd>U</kbd> undo</span></div></section></div> : null}
      {notice ? <div className="toast" role="status" aria-live="polite"><span className="toast-pip" />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button></div> : null}
    </div>
  )
}
