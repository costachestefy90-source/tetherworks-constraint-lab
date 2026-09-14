# Tetherworks: feature directions

Before implementation, I explored five possible ways to frame the project:

1. **A pure rope playground** — a minimal, tactile sandbox centered on dragging a single rope and watching it settle. Easy to learn, but too narrow for chains, springs, pulleys, and interconnected structures.
2. **A structural engineering desk** — focus on bridge spans, load paths, safety factors, and failure. Great for explaining forces, but it risks feeling like a static calculator instead of a playful lab.
3. **A machine-building puzzle game** — give users mechanical goals and score them on stability or timing. More game-like, but it would make experimentation feel constrained and require a large content layer.
4. **A generative chain-reaction toy** — emphasize explosions, domino-like triggers, and spectacle. Visually fun, though it underplays the quieter satisfaction of tension, damping, and equilibrium.
5. **A constraint lab / instrument panel** — combine a reliable small physics core with construction tools, live force telemetry, presets, and clear controls. This supports ropes, chains, elastic behavior, suspension structures, and failure analysis while still feeling inviting.

## Chosen direction

I’m choosing **the constraint lab / instrument panel**. It has the strongest balance of breadth, clarity, and interaction: the same core can power a pendulum, a bridge, a hanging sign, a spring system, or a chain reaction, while the UI makes the invisible forces legible. The first milestone is a dependable verlet-style solver for pinned nodes and distance constraints. From there, presets, cutting, stress colors, wind, and inspector controls can grow without changing the mental model.

## Build sequence

1. Solver and canvas renderer: nodes, constraints, gravity, damping, wind, reset/play.
2. Construction modes: select/drag, add anchor, add mass, cut constraints.
3. Material behavior: rope, chain, elastic, stiffness, segment count, tension visualization.
4. Presets and telemetry: bridges, pendulums, signs, wrecking ball, spring system, chain reaction.
5. Polish pass: responsive layout, accessible controls, keyboard shortcuts, performance guardrails, and documentation.
