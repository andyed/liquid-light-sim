# Liquid Light Simulation – Technical Notes (for Future Us)

This document is a snapshot of the current simulation architecture, the major improvements from the latest session, the known challenges, and a concrete plan for adding the Oil Layer next. It’s written as a love letter to our future selves so we don’t re‑learn the same lessons twice.

## Overview
- **Domain**: Circular plate inside a rectangular canvas; physics are aspect‑correct.
- **Pipeline (per frame)**:
  1. External forces (rotation, jets)
  2. Vorticity confinement (optional)
  3. Advect velocity
  4. Viscosity (Jacobi)
  5. Pressure projection (divergence → pressure → gradient subtraction)
  6. Advect color
  7. Optional diffusion
- **Data**: Half‑float textures (performance + stability) with NEAREST sampling for FBOs.
- **Debug**: HSV velocity visualization (angle→hue, magnitude→value) + concentration debug mode.

## Core Architecture
- Textures (half‑float):
  - Color: `RGBA16F`
  - Velocity: `RG16F`
  - Divergence: `R16F`
  - Pressure: `R16F`
- Shaders:
  - `forces.frag.glsl` – rotation, jet (external) forces, rim bounce
  - `vorticity-confinement.frag.glsl` – small‑scale swirl injection
  - `advection.frag.glsl` – velocity/color advection (semi‑Lagrangian for velocity, MacCormack for color)
  - `viscosity.frag.glsl` – viscosity diffusion (Jacobi)
  - `divergence.frag.glsl`, `pressure.frag.glsl`, `gradient.frag.glsl` – incompressible projection
  - `boundary.frag.glsl` – aspect‑correct visual rim overlay
  - `debug-velocity.frag.glsl` – HSV velocity view
- All physics shaders are `highp`, which improved symmetry and reduced quadrant artifacts.

## Aspect‑Correct Domain (Key Idea)
- Compute distances and clamps in **aspect space**:
  - `aspect = u_resolution.x / u_resolution.y`
  - Map `uv → aspect space` for distances and masks, then map back.
- We use a strict inside mask for solver passes and an aspect‑correct clamp for advection/backtraces.

## What We Changed This Session
- **Aspect‑correct physics (restored):**
  - divergence, pressure, gradient, viscosity now receive `u_resolution` and mask to the circle.
  - advection clamps backtraces to an aspect‑correct circle.
- **Forces (rotation/bounce):**
  - Rotation computed as true rigid‑body `ω × r` in aspect space; mapped back to UV.
  - Added center dead‑zone + smooth ramp (`smoothstep(0.04, 0.09, dist)`) to eliminate central whirlpool.
  - Rotation masked to the circular domain.
  - Added rim bounce (thin band) that cancels inward normal velocity (elastic reflection without artificial drain).
- **Advection:**
  - Velocity advection uses **stable semi‑Lagrangian** (no MacCormack) to avoid center oscillations and blocky inflation.
  - Color advection uses **MacCormack + limiter**; conservative magnitude cap against the neighborhood max and prior value (+0.02 allowance) to curb density growth.
  - Neighborhood sampling now uses `textureSize(...)` texel size to remove rectangular bias.
- **Precision / Formats:**
  - Switched to half‑float FBOs: `RGBA16F/RG16F/R16F` with `HALF_FLOAT`.
  - Upgraded physics shaders to `highp float`.
  - Fixed `readPixels` for RG16F by using `HALF_FLOAT` and half→float conversion for corruption checks.
- **Debug tooling:**
  - Restored HSV velocity debug shader and integrated into the renderer.

## Known Issues + Mitigations
- **Color inflation under rotation:**
  - MacCormack can overshoot; we added a limiter and conservative cap. If needed, tighten cap to `+0.01`.
- **Central artifacts:**
  - Fixed via larger center dead‑zone for rotation and semi‑Lagrangian on velocity.
- **Rim behavior:**
  - Bounce improved by canceling inward normal component in a 4–5% band near the wall; adjust elasticity `k` if needed.
- **Visualization vs. physics:**
  - The RG pass‑through view can look “rectangular.” Use HSV velocity debug for ground truth.

## Tuning Guide (Current Good Defaults)
- Rotation gain in `forces.frag.glsl`: `rotationGain = 18–22`.
- Center dead‑zone ramp: `smoothstep(0.04, 0.09, dist)`.
- Rim bounce band: `smoothstep(containerRadius - 0.04, containerRadius, dist)`.
- Bounce elasticity: `k = 0.9–1.0` (1.0 = perfectly elastic cancel of inward normal).
- Pressure iterations: `50–70` (raise if faint divergence leaks under strong rotation).
- Vorticity confinement: `0.0–0.8` (set to `0.0` when validating conservation).

## Adding the Oil Layer (Next)
Goal: Two‑layer system – water (ink carrier) + oil (lens/viscosity layer) with distinct advection/viscosity and coupling at the interface.

- **Data layout:**
  - Add an `oil` RGBA16F texture (or two if ping‑pong needed) to store scalar height/thickness and visual tints.
  - Optional: separate `oilVelocity` RG16F if oil dynamics need independent motion.
- **Physics:**
  - Oil advection can be slower (higher viscosity) and weakly coupled to the water velocity (e.g., `v_oil = mix(v_water, v_oil, alpha)` per step).
  - Add a surface tension or smoothing step on oil to produce lensy, rounded shapes.
  - Consider buoyancy‑like coupling: gradients in oil thickness apply gentle forces on water velocity.
- **Rendering:**
  - Use oil thickness to modulate refractive index or soft refraction in post.
  - Combine Beer‑Lambert absorption with a simple Fresnel‑ish highlight for the oil sheen.
- **Order of operations:**
  1. Advect water velocity → viscosity → projection (as now).
  2. Advect oil (by water or own velocity) → oil viscosity/smoothing.
  3. Apply coupling forces (oil→water and/or water→oil).
  4. Advect color by water velocity.
  5. Composite: oil optical effects over color.

## Testing / Debugging Checklist
- Toggle post/volumetric off when validating physics (O, L).
- Use HSV velocity debug to check rotation symmetry and bounce.
- Temporarily set `vorticityStrength = 0.0` when quantifying conservation.
- Track total ink mass (sum of color magnitude) over time for regression tests.

## Open TODOs
- [ ] Expose rotation gain and rim bounce elasticity to UI sliders.
- [ ] Optional: tighten color cap to `+0.01` if any growth remains under continuous rotation.
- [ ] Implement oil layer textures + advection pass scaffold.
- [ ] Add a simple oil smoothing/tension step (1–2 Jacobi iterations or curvature‑based blur).
- [ ] Add an on‑screen mass meter (total color magnitude) for conservation tracking.

---

If something looks strangely rectangular, it’s probably the visualization. Flip to HSV velocity debug first. If rotation looks like a whirlpool in the middle, reduce its center drive (keep the dead‑zone) and ensure velocity advection is semi‑Lagrangian.
