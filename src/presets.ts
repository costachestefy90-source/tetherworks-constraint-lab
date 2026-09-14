import { ConstraintWorld, Material } from './physics'

export interface PresetDefinition {
  id: string
  name: string
  eyebrow: string
  description: string
  material: Material
  badge: string
  build: (world: ConstraintWorld) => void
}

const chainBetween = (world: ConstraintWorld, points: number[], material: Material, stiffness?: number) => {
  for (let index = 0; index < points.length - 1; index += 1) {
    world.addLink(points[index], points[index + 1], { material, stiffness })
  }
}

const addCatenary = (world: ConstraintWorld, start: { x: number; y: number }, end: { x: number; y: number }, count: number, material: Material, dip: number, stiffness?: number) => {
  const ids: number[] = []
  for (let index = 0; index <= count; index += 1) {
    const progress = index / count
    const x = start.x + (end.x - start.x) * progress
    const y = start.y + (end.y - start.y) * progress + Math.sin(progress * Math.PI) * dip
    ids.push(world.addPoint(x, y, { pinned: index === 0 || index === count, radius: index === 0 || index === count ? 10 : 6 }))
  }
  chainBetween(world, ids, material, stiffness)
  return ids
}

const createBridge = (world: ConstraintWorld, material: Material, deckCount = 10) => {
  const leftAnchor = world.addPoint(84, 144, { pinned: true, radius: 11, label: 'north-west anchor' })
  const rightAnchor = world.addPoint(916, 144, { pinned: true, radius: 11, label: 'north-east anchor' })
  const cable = addCatenary(world, { x: 84, y: 144 }, { x: 916, y: 144 }, 18, material, 120, 0.88)
  const deck: number[] = []
  for (let index = 0; index <= deckCount; index += 1) {
    const progress = index / deckCount
    deck.push(world.addPoint(135 + progress * 730, 396 + Math.sin(progress * Math.PI) * 28, { mass: 1.15, radius: 9, tint: '#F6C453' }))
  }
  chainBetween(world, deck, 'chain', 1.02)
  for (let index = 0; index < deck.length; index += 1) {
    const cableIndex = Math.round((index / deckCount) * (cable.length - 1))
    world.addLink(deck[index], cable[cableIndex], { material: 'rope', stiffness: 0.68 })
  }
  // Small stabilizer ties make the bridge read as a structure instead of a single line.
  world.addLink(leftAnchor, deck[0], { material: 'rope', stiffness: 0.72 })
  world.addLink(rightAnchor, deck[deck.length - 1], { material: 'rope', stiffness: 0.72 })
  return { leftAnchor, rightAnchor, deck }
}

export const PRESETS: PresetDefinition[] = [
  {
    id: 'suspension',
    name: 'Suspension bridge',
    eyebrow: 'STRUCTURAL / 01',
    description: 'A pair of anchors, a live catenary, and a weighted deck. Pull the span to see load paths change.',
    material: 'rope',
    badge: 'Load path',
    build: (world) => {
      createBridge(world, 'rope', 11)
    },
  },
  {
    id: 'pendulum',
    name: 'Pendulum sweep',
    eyebrow: 'MOTION / 02',
    description: 'A long chain with a heavy bob. Drag the weight, release, and study the changing energy trace.',
    material: 'chain',
    badge: 'Kinetic',
    build: (world) => {
      const ids: number[] = [world.addPoint(500, 88, { pinned: true, radius: 11, label: 'pendulum anchor' })]
      for (let index = 1; index <= 12; index += 1) {
        ids.push(world.addPoint(500 + index * 7, 88 + index * 29, { mass: index === 12 ? 8 : 0.7, radius: index === 12 ? 20 : 6, tint: index === 12 ? '#F08A5D' : '#BEE6E0', velocity: index === 12 ? { x: -120, y: 0 } : undefined }))
      }
      chainBetween(world, ids, 'chain', 1.02)
    },
  },
  {
    id: 'sign',
    name: 'Hanging sign',
    eyebrow: 'BALANCE / 03',
    description: 'Two suspension points share a sign load. Add wind and watch the panel settle into a new angle.',
    material: 'rope',
    badge: 'Equilibrium',
    build: (world) => {
      const left = world.addPoint(278, 112, { pinned: true, radius: 11, label: 'left anchor' })
      const right = world.addPoint(722, 112, { pinned: true, radius: 11, label: 'right anchor' })
      const topLeft = world.addPoint(390, 232, { mass: 1.2, radius: 8 })
      const topRight = world.addPoint(610, 232, { mass: 1.2, radius: 8 })
      const bottomLeft = world.addPoint(390, 378, { mass: 2, radius: 9, tint: '#F6C453' })
      const bottomRight = world.addPoint(610, 378, { mass: 2, radius: 9, tint: '#F6C453' })
      world.addLink(left, topLeft, { material: 'rope', stiffness: 0.9 })
      world.addLink(right, topRight, { material: 'rope', stiffness: 0.9 })
      world.addLink(topLeft, topRight, { material: 'chain', stiffness: 0.86 })
      world.addLink(topLeft, bottomLeft, { material: 'chain', stiffness: 1.02 })
      world.addLink(topRight, bottomRight, { material: 'chain', stiffness: 1.02 })
      world.addLink(bottomLeft, bottomRight, { material: 'elastic', stiffness: 0.68 })
      world.addLink(topLeft, bottomRight, { material: 'elastic', stiffness: 0.56 })
      world.addLink(topRight, bottomLeft, { material: 'elastic', stiffness: 0.56 })
    },
  },
  {
    id: 'wrecking',
    name: 'Wrecking arc',
    eyebrow: 'IMPACT / 04',
    description: 'A heavy ball on an offset chain. Wind it up, then let gravity show where momentum goes.',
    material: 'chain',
    badge: 'Momentum',
    build: (world) => {
      const ids: number[] = [world.addPoint(770, 100, { pinned: true, radius: 11, label: 'crane anchor' })]
      for (let index = 1; index <= 9; index += 1) {
        ids.push(world.addPoint(770 - index * 11, 100 + index * 29, { mass: index === 9 ? 10 : 0.65, radius: index === 9 ? 26 : 6, tint: index === 9 ? '#F08A5D' : '#BEE6E0', velocity: index === 9 ? { x: -180, y: -40 } : undefined }))
      }
      chainBetween(world, ids, 'chain', 1.08)
      const floorLeft = world.addPoint(176, 512, { pinned: true, radius: 10, label: 'impact rail' })
      const floorRight = world.addPoint(328, 512, { pinned: true, radius: 10 })
      world.addLink(floorLeft, floorRight, { material: 'elastic', stiffness: 0.75 })
    },
  },
  {
    id: 'rope-bridge',
    name: 'Rope bridge',
    eyebrow: 'FIELD / 05',
    description: 'A loose crossing with a little less stiffness. Drag a plank and see the whole walkway respond.',
    material: 'rope',
    badge: 'Soft body',
    build: (world) => {
      const left = world.addPoint(94, 148, { pinned: true, radius: 11, label: 'left anchor' })
      const right = world.addPoint(906, 148, { pinned: true, radius: 11, label: 'right anchor' })
      const rail = addCatenary(world, { x: 94, y: 148 }, { x: 906, y: 148 }, 14, 'rope', 185, 0.72)
      const planks: number[] = []
      for (let index = 0; index <= 8; index += 1) {
        const x = 176 + index * 81
        const y = 410 + Math.sin(index * 0.8) * 12
        planks.push(world.addPoint(x, y, { mass: 1.8, radius: 11, tint: '#F6C453' }))
      }
      chainBetween(world, planks, 'chain', 0.7)
      planks.forEach((plank, index) => {
        world.addLink(plank, rail[2 + index], { material: 'rope', stiffness: 0.5 })
      })
      world.addLink(left, planks[0], { material: 'rope', stiffness: 0.72 })
      world.addLink(right, planks[planks.length - 1], { material: 'rope', stiffness: 0.72 })
    },
  },
  {
    id: 'spring-system',
    name: 'Spring system',
    eyebrow: 'ELASTIC / 06',
    description: 'Elastic links trade stretch for bounce. Increase stiffness to turn this into a tuned oscillator.',
    material: 'elastic',
    badge: 'Restoring',
    build: (world) => {
      const left = world.addPoint(310, 112, { pinned: true, radius: 11, label: 'spring mount' })
      const right = world.addPoint(690, 112, { pinned: true, radius: 11 })
      const center = world.addPoint(500, 258, { mass: 3.8, radius: 18, tint: '#F08A5D', velocity: { x: 80, y: 0 } })
      const leftMid = world.addPoint(408, 178, { mass: 0.8, radius: 7 })
      const rightMid = world.addPoint(592, 178, { mass: 0.8, radius: 7 })
      world.addLink(left, leftMid, { material: 'elastic', stiffness: 1.14 })
      world.addLink(leftMid, center, { material: 'elastic', stiffness: 1.05 })
      world.addLink(right, rightMid, { material: 'elastic', stiffness: 1.14 })
      world.addLink(rightMid, center, { material: 'elastic', stiffness: 1.05 })
      world.addLink(leftMid, rightMid, { material: 'rope', stiffness: 0.42 })
      world.addLink(center, world.addPoint(500, 506, { pinned: true, radius: 10, label: 'ground anchor' }), { material: 'elastic', stiffness: 0.5, restLength: 246 })
    },
  },
  {
    id: 'reaction',
    name: 'Chain reaction',
    eyebrow: 'CASCADE / 07',
    description: 'A row of hanging weights turns one nudge into a cascade across mixed constraints.',
    material: 'chain',
    badge: 'Experimental',
    build: (world) => {
      const top: number[] = []
      const balls: number[] = []
      for (let index = 0; index < 6; index += 1) {
        const x = 180 + index * 128
        top.push(world.addPoint(x, 96, { pinned: true, radius: 10, label: `anchor ${index + 1}` }))
        balls.push(world.addPoint(x + (index === 0 ? -35 : index === 1 ? 24 : 0), 316 + (index % 2) * 7, { mass: 3.6, radius: 17, tint: index % 2 ? '#F6C453' : '#F08A5D', velocity: index === 0 ? { x: 130, y: -10 } : undefined }))
        world.addLink(top[index], balls[index], { material: index % 2 ? 'elastic' : 'chain', stiffness: 0.9 })
        if (index > 0) world.addLink(balls[index - 1], balls[index], { material: 'rope', stiffness: 0.48, restLength: 106 })
      }
      world.addLink(top[0], top[top.length - 1], { material: 'rope', stiffness: 0.28, restLength: 640 })
    },
  },
]

export const getPreset = (id: string) => PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]
