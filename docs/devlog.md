# Tetherworks development log

This log records the meaningful build milestones behind the public Stardance project page.

## 2026-09-13 — Constraint lab foundation

- Built a static React + TypeScript constraint sandbox with a small Verlet-style solver.
- Added seven guided studies: suspension bridge, pendulum sweep, hanging sign, wrecking arc, rope bridge, spring system, and chain reaction.
- Added rope, chain, and elastic materials plus gravity, wind, damping, stiffness, solver-pass, stress-color, and field-guide controls.
- Published the first GitHub Pages build and linked the public repository and demo from Stardance.

## 2026-09-13 — Interaction and telemetry pass

- Added direct node linking and segmented mass attachment so structures can be built without leaving the field.
- Added peak tension, stability, energy trace, and center-of-mass telemetry alongside the existing live solver readout.
- Added an opt-in failure redline that cuts overloaded links at a tunable tension threshold.
- Added the inspector Nudge action and `K` shortcut for repeatable impulses, plus focus labels for readable node IDs.

## 2026-09-13 — Builder refinement pass

- Added live mass-weight tuning from 0.5 kg to 12 kg.
- Added Pin / Release so a selected mass can become an anchor or return to motion without rebuilding the study.
- Added a bounded undo stack for topology and material edits, with an `U` shortcut and an inspect-mode restore state.
- Made pin / release undoable and added an optional weighted center-of-mass marker to connect the telemetry to the canvas.
- Added a project info panel with a compact workflow and keyboard reference, then refreshed the README and Stardance project metadata.

Every milestone above was checked with `npm run typecheck`, `npm run build`, and `git diff --check` before being pushed to `main`.
