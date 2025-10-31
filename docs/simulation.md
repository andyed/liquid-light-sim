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
- **Forces (rotation/boundary):**
  - Rotation modeled as **viscous coupling** from spinning plate boundary (mimics friction transmission through fluid layers).
  - Applied everywhere with blend factor (`viscousCoupling = 0.25`) for lingering rotation influence—no center dead-zone to avoid pooling.
  - Removed edgeFalloff; rotation applies uniformly inside plate to rim for persistent angular momentum.
  - Tiny epsilon (`0.002`) at exact center to avoid singularity; rim feather only.
  - Rotation masked to the circular domain.
  - **Three boundary modes** (B key to cycle):
    - Mode 0 (Bounce): Elastic reflection - cancels inward normal velocity (original behavior)
    - Mode 1 (Viscous Drag): Squeeze film effect - models increased resistance from ink between moving ink and wall; damps tangential velocity and strongly resists outward motion
    - Mode 2 (Repulsive Force): Soft potential wall - exponentially increasing repulsion as ink approaches edge, prevents collisions
- **Advection:**
  - Velocity advection uses **stable semi‑Lagrangian** (no MacCormack) to avoid center oscillations and blocky inflation.
  - Color advection uses **MacCormack + softened limiter** (epsilon=0.08, sharpness=0.3); conservative magnitude cap against neighborhood max and prior value (+0.05 allowance).
  - Smooth boundary clamp (0.015 blend zone) instead of hard snap to eliminate rim banding.
  - Gentle rim absorption (15% in 3% band) to prevent accumulation artifact at boundary.
  - Neighborhood sampling uses `textureSize(...)` texel size to remove rectangular bias.
- **Precision / Formats:**
  - Switched to half‑float FBOs: `RGBA16F/RG16F/R16F` with `HALF_FLOAT`.
  - Upgraded physics shaders to `highp float`.
  - Fixed `readPixels` for RG16F by using `HALF_FLOAT` and half→float conversion for corruption checks.
- **Debug tooling:**
  - Restored HSV velocity debug shader and integrated into the renderer.
- **Post‑processing (anti‑banding):**
  - Anisotropic distortion (0.4) with high‑frequency noise targeting horizontal lines.
  - Strengthened dither (2.0x) to break up quantization artifacts.
  - Bilateral blur (0.5) for edge‑preserving smoothing.
  - Conditional glow and saturation boost (only when distortion active).

## Known Issues + Mitigations
- **Color inflation under rotation:**
  - MacCormack can overshoot; softened limiter (epsilon=0.08) and conservative cap (+0.05 allowance) prevent growth.
- **Central artifacts:**
  - Fixed via viscous coupling model (gentle blend instead of instant injection) and semi‑Lagrangian on velocity advection.
- **Rim banding (horizontal lines):**
  - Fixed via smooth boundary clamp (0.015 blend zone), softened MacCormack limiter, anisotropic distortion, and dither.
- **Rim accumulation (bright ring):**
  - Fixed via gentle rim absorption (15% in 3% band) and narrowed smooth clamp zone.
- **Rim bounce:**
  - Applied as smooth blend factor (no hard conditionals); cancels inward normal in 4% band; adjust elasticity `k` if needed.
- **Visualization vs. physics:**
  - The RG pass‑through view can look "rectangular." Use HSV velocity debug for ground truth.

## Tuning Guide (Current Good Defaults)
- Rotation gain in `forces.frag.glsl`: `rotationGain = 18–22`.
- Viscous coupling: `viscousCoupling = 0.2–0.3` (0.25 default; higher = stronger torque transmission and longer persistence).
- Rim feather band: `smoothstep(containerRadius - 0.03, containerRadius, dist)`.
- **Boundary modes** (toggle with B key):
  - Mode 0 (Bounce): `k = 0.9–1.0` (0.95 default; elasticity), band = 0.04
  - Mode 1 (Viscous Drag): `dragCoeff = 0.85` max, band = 0.08, tangential damp = 0.6, radial resist = 1.2
  - Mode 2 (Repulsive Force): `repulsionStrength = 0.008`, band = 0.12, cubic falloff
- Boundary clamp soft edge: `0.01–0.02` (0.015 default; balance smoothness vs accumulation).
- Rim absorption: `0.1–0.2` (0.15 default; prevents bright ring artifact).
- MacCormack limiter epsilon: `0.05–0.1` (0.08 default; higher = softer, less banding).
- MacCormack sharpness: `0.2–0.4` (0.3 default; lower = more forward blend, less artifacts).
- Pressure iterations: `50–70` (raise if faint divergence leaks under strong rotation).
- Vorticity confinement: `0.0–0.8` (set to `0.0` when validating conservation).
- Post distortion: `0.3–0.5` (0.4 default; breaks up axis‑aligned banding).
- Post dither: `1.5–2.5` (2.0 default; breaks up quantization).

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

If something looks strangely rectangular, it's probably the visualization. Flip to HSV velocity debug first. If rotation still creates artifacts, adjust `viscousCoupling` (lower = gentler) and ensure velocity advection is semi‑Lagrangian. The viscous coupling model eliminates both center pooling and hard seams by mimicking friction transmission from the spinning plate boundary.

If horizontal banding persists at the rim: increase `softEdge` in `clampToCircle` (0.015 → 0.02) and/or increase post‑processing distortion (0.4 → 0.5). If a bright ring appears at the rim: increase `rimAbsorption` (0.15 → 0.2) or widen the absorption band (0.03 → 0.04).
