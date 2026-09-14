export type Material = 'rope' | 'chain' | 'elastic'

export interface PhysicsConfig {
  gravity: number
  wind: number
  damping: number
  stiffness: number
  solverPasses: number
  showStress?: boolean
}

export interface Point {
  id: number
  x: number
  y: number
  oldX: number
  oldY: number
  mass: number
  radius: number
  pinned: boolean
  label?: string
  tint?: string
}

export interface Link {
  id: number
  a: number
  b: number
  restLength: number
  material: Material
  stiffness: number
  damping: number
  tension: number
}

export interface WorldMetrics {
  energy: number
  kinetic: number
  potential: number
  spring: number
  maxTension: number
  avgTension: number
  stability: number
  centerOfMass: { x: number; y: number }
}

const MATERIAL_DEFAULTS: Record<Material, { stiffness: number; damping: number }> = {
  rope: { stiffness: 0.78, damping: 0.12 },
  chain: { stiffness: 0.94, damping: 0.08 },
  elastic: { stiffness: 1.18, damping: 0.04 },
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

const distanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay)
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1)
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export class ConstraintWorld {
  readonly points: Point[] = []
  readonly links: Link[] = []
  time = 0
  stepCount = 0

  private nextPointId = 1
  private nextLinkId = 1

  constructor(public width = 1000, public height = 620) {}

  resize(width: number, height: number) {
    this.width = width
    this.height = height
  }

  clear() {
    this.points.length = 0
    this.links.length = 0
    this.time = 0
    this.stepCount = 0
    this.nextPointId = 1
    this.nextLinkId = 1
  }

  addPoint(x: number, y: number, options: Partial<Omit<Point, 'id' | 'x' | 'y' | 'oldX' | 'oldY'>> & { velocity?: { x: number; y: number } } = {}) {
    const velocity = options.velocity ?? { x: 0, y: 0 }
    const point: Point = {
      id: this.nextPointId++,
      x,
      y,
      oldX: x - velocity.x / 60,
      oldY: y - velocity.y / 60,
      mass: options.mass ?? 1,
      radius: options.radius ?? 8,
      pinned: options.pinned ?? false,
      label: options.label,
      tint: options.tint,
    }
    this.points.push(point)
    return point.id
  }

  addLink(a: number, b: number, options: Partial<Omit<Link, 'id' | 'a' | 'b' | 'restLength' | 'tension'>> & { restLength?: number } = {}) {
    const pointA = this.getPoint(a)
    const pointB = this.getPoint(b)
    if (!pointA || !pointB || a === b) return null
    const material = options.material ?? 'rope'
    const defaults = MATERIAL_DEFAULTS[material]
    const link: Link = {
      id: this.nextLinkId++,
      a,
      b,
      restLength: options.restLength ?? distance(pointA, pointB),
      material,
      stiffness: options.stiffness ?? defaults.stiffness,
      damping: options.damping ?? defaults.damping,
      tension: 0,
    }
    this.links.push(link)
    return link.id
  }

  getPoint(id: number) {
    return this.points.find((point) => point.id === id)
  }

  getLink(id: number) {
    return this.links.find((link) => link.id === id)
  }

  setMaterial(material: Material) {
    const defaults = MATERIAL_DEFAULTS[material]
    this.links.forEach((link) => {
      link.material = material
      link.stiffness = defaults.stiffness
      link.damping = defaults.damping
    })
  }

  step(dt = 1 / 60, config: PhysicsConfig) {
    const passes = clamp(Math.round(config.solverPasses), 2, 14)
    const substeps = 2
    const subDt = dt / substeps
    this.time += dt
    this.stepCount += 1

    for (let substep = 0; substep < substeps; substep += 1) {
      this.points.forEach((point) => {
        if (point.pinned) return

        const velocityX = (point.x - point.oldX) * config.damping
        const velocityY = (point.y - point.oldY) * config.damping
        const localWind = config.wind * (0.65 + 0.35 * Math.sin(this.time * 1.2 + point.id * 0.8))

        point.oldX = point.x
        point.oldY = point.y
        point.x += velocityX + localWind * subDt * subDt * 2.2
        point.y += velocityY + config.gravity * subDt * subDt

        const floor = this.height - 26
        if (point.y > floor) {
          point.y = floor
          point.oldY = point.y + velocityY * 0.12
        }
        if (point.x < 18) {
          point.x = 18
          point.oldX = point.x + velocityX * 0.12
        }
        if (point.x > this.width - 18) {
          point.x = this.width - 18
          point.oldX = point.x + velocityX * 0.12
        }
        if (point.y < 20) {
          point.y = 20
          point.oldY = point.y + velocityY * 0.12
        }
      })

      for (let pass = 0; pass < passes; pass += 1) {
        this.links.forEach((link) => {
          const a = this.getPoint(link.a)
          const b = this.getPoint(link.b)
          if (!a || !b) return

          const dx = b.x - a.x
          const dy = b.y - a.y
          const length = Math.max(0.001, Math.hypot(dx, dy))
          const extension = length - link.restLength
          // Rope and chain carry tension but go slack under compression; elastic
          // elements keep their restoring force in both directions.
          if (extension < 0 && link.material !== 'elastic') {
            link.tension *= 0.86
            return
          }

          const inverseMassA = a.pinned ? 0 : 1 / Math.max(0.1, a.mass)
          const inverseMassB = b.pinned ? 0 : 1 / Math.max(0.1, b.mass)
          const inverseMassTotal = inverseMassA + inverseMassB
          if (inverseMassTotal === 0) return

          const normalizedError = extension / Math.max(1, link.restLength)
          const correction = clamp(normalizedError * config.stiffness * link.stiffness * 0.62, -0.095, 0.095)
          const correctionX = (dx / length) * correction
          const correctionY = (dy / length) * correction
          if (!a.pinned) {
            a.x += correctionX * (inverseMassA / inverseMassTotal)
            a.y += correctionY * (inverseMassA / inverseMassTotal)
          }
          if (!b.pinned) {
            b.x -= correctionX * (inverseMassB / inverseMassTotal)
            b.y -= correctionY * (inverseMassB / inverseMassTotal)
          }
          link.tension = clamp(Math.abs(normalizedError) * 100 * link.stiffness, 0, 100)
        })
      }
    }
  }

  dragPoint(id: number, x: number, y: number) {
    const point = this.getPoint(id)
    if (!point || point.pinned) return
    point.x = clamp(x, 20, this.width - 20)
    point.y = clamp(y, 20, this.height - 28)
    point.oldX = point.x
    point.oldY = point.y
  }

  findPointAt(x: number, y: number, maxDistance = 30) {
    let nearest: Point | undefined
    let nearestDistance = maxDistance
    this.points.forEach((point) => {
      const candidateDistance = Math.hypot(point.x - x, point.y - y)
      if (candidateDistance <= nearestDistance) {
        nearest = point
        nearestDistance = candidateDistance
      }
    })
    return nearest
  }

  cutLinkAt(x: number, y: number, maxDistance = 18) {
    let candidate: Link | undefined
    let candidateDistance = maxDistance
    this.links.forEach((link) => {
      const a = this.getPoint(link.a)
      const b = this.getPoint(link.b)
      if (!a || !b) return
      const currentDistance = distanceToSegment(x, y, a.x, a.y, b.x, b.y)
      if (currentDistance < candidateDistance) {
        candidate = link
        candidateDistance = currentDistance
      }
    })
    if (!candidate) return null
    const index = this.links.findIndex((link) => link.id === candidate?.id)
    if (index < 0) return null
    this.links.splice(index, 1)
    return candidate
  }

  getMetrics(config: PhysicsConfig): WorldMetrics {
    let kinetic = 0
    let potential = 0
    let spring = 0
    let totalMass = 0
    let centerX = 0
    let centerY = 0

    this.points.forEach((point) => {
      const velocityX = (point.x - point.oldX) * 60
      const velocityY = (point.y - point.oldY) * 60
      kinetic += 0.5 * point.mass * (velocityX * velocityX + velocityY * velocityY) * 0.003
      potential += point.mass * config.gravity * Math.max(0, point.y) * 0.002
      totalMass += point.mass
      centerX += point.x * point.mass
      centerY += point.y * point.mass
    })
    this.links.forEach((link) => {
      const a = this.getPoint(link.a)
      const b = this.getPoint(link.b)
      if (!a || !b) return
      const extension = distance(a, b) - link.restLength
      spring += extension * extension * link.stiffness * 0.018
    })

    const tensions = this.links.map((link) => link.tension)
    const maxTension = tensions.length ? Math.max(...tensions) : 0
    const avgTension = tensions.length ? tensions.reduce((sum, value) => sum + value, 0) / tensions.length : 0
    const stability = clamp(100 - avgTension * 0.58 - maxTension * 0.16, 0, 100)

    return {
      energy: kinetic + potential + spring,
      kinetic,
      potential,
      spring,
      maxTension,
      avgTension,
      stability,
      centerOfMass: {
        x: totalMass ? centerX / totalMass : this.width / 2,
        y: totalMass ? centerY / totalMass : this.height / 2,
      },
    }
  }
}

export const materialLabel: Record<Material, string> = {
  rope: 'Rope',
  chain: 'Chain',
  elastic: 'Elastic',
}
