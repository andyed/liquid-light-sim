###
## FluidLayer interface (contract)

Each layer must implement the following, using Simulation-provided programs and helpers:

- Resources (owned by layer)
  - `colorTexture1/2`, `colorFBO`
  - `velocityTexture1/2`, `velocityFBO`
  - `divergenceTexture/FBO`, `pressureTexture1/2`, `pressureFBO`
- Lifecycle
  - `init()` – create textures/FBOs via `sim.createTexture/FBO` and call `_syncAliases()`
  - `resize()` – delete/recreate textures/FBOs and `_syncAliases()`
  - `update(dt)` – run the per-frame pipeline (forces → vorticity → advect v → viscosity → project → advect color → diffusion) and occupancy/overflow cadence
- IO
  - `splatColor(x, y, color, radius)`
  - `splatVelocity(x, y, vx, vy, radius)`
- Conservation control
  - `computeOccupancy()` – render occupancy to `sim.occupancyFBO` using `sim.occupancyProgram`, read back and set `sim.occupancyPercent`/`sim.pixelSoupPercent`
  - `applyOverflow(strength)` – run damp pass using `sim.overflowProgram` and layer color textures, then swap
- Swaps (must update aliases)
  - `swapColorTextures()`, `swapVelocityTextures()`, `swapPressureTextures()` → call `_syncAliases()`
- Simulation responsibilities (provided by `Simulation`)
  - Shader programs (`forces`, `vorticity`, `advection`, `viscosity`, `divergence`, `pressure`, `gradient`, `splat`, `overflow`, `occupancy`)
  - Helpers: `createTexture`, `createFBO`, global uniforms (resolution), iteration scaling, corruption check, occupancy FBO/size

### Input parity and controls
- **Keyboard on mobile emulator** works by making the canvas focusable (`tabindex=0`) and listening on both `document` and `window` for key events. Arrow keys/A‑D map to rotation.
- **Two‑finger jet** on touch devices mirrors right‑click on desktop: one finger paints, two fingers inject a jet; transitions mid‑gesture are handled.
- **Rotation model (base + delta):** UI button sets `rotationBase` (sticky); keys/gestures set `rotationDelta` (transient). `rotationAmount = base + delta` each frame.
- **Interleaved inking & flow:** Controller injects first; the same frame runs forces/advection so new dye is immediately advected while rotation persists during painting.
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
- **Layered ownership:** `Simulation` owns shader programs and orchestrates. `WaterLayer` (extending `FluidLayer`) owns its textures/FBOs, swaps, and overflow/occupancy passes; `Simulation` exposes aliases kept in sync.
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
  - `oil-composite.frag.glsl` – Oil soft refraction + Fresnel highlight composite over scene
- All physics shaders are `highp`, which improved symmetry and reduced quadrant artifacts.

## Aspect‑Correct Domain (Key Idea)
- Compute distances and clamps in **aspect space**:
  - `aspect = u_resolution.x / u_resolution.y`
  - Map `uv → aspect space` for distances and masks, then map back.
- We use a strict inside mask for solver passes and an aspect‑correct clamp for advection/backtraces.

## Resolution & Responsiveness (Parity)
- **Canvas sizing**
  - Portrait: CSS canvas is square (short edge), landscape: fills viewport. Physics radius remains fixed at `0.48` in UV space.
  - On resize we only recreate textures when the drawing‑buffer size actually changes to avoid needless resets.
- **Device Pixel Ratio (DPR)**
  - Drawing buffer uses `cssSize × devicePixelRatio` (clamped to `MAX_TEXTURE_SIZE`) to align mobile with desktop visual fidelity.
  - CSS size is preserved; only the backing buffer scales.
- **Resolution parity fixes**
  - All rim bands (feather/bounce/drag/repulsion/overflow) are normalized to pixel scale using `min(u_resolution)` so visual and physical width are consistent across resolutions.
  - Solver effort scales with resolution: `pressureIterations` and `viscosityIterations` increase as the drawing‑buffer gets smaller, maintaining similar damping and spin‑up behavior across devices.
- **Viewport safety**
  - Each frame begins with a full‑canvas `gl.viewport(...)` and passes that temporarily change viewport restore it, preventing stale viewports from clipping work on some mobile GPUs.

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
- **Rotation strength reduction:**
  - Reduced `rotationGain` from `16.0` → `0.4` in `forces.frag.glsl` to avoid over-energizing with single taps and improve visual conservation.
  - Added rotating force emitter near center (15% radius) to prevent ink pooling in rotational dead zone.
  - Force builds up gradually over ~1 second of sustained rotation (invisible at start).
  - Emitter rotates 3× faster than plate for natural sweeping pattern.
- **Conservation guardrail (Overflow control):**
  - Added occupancy measurement pass (`occupancy.frag.glsl`) that counts percent of pixels inked inside the circular domain.
  - Added overflow valve pass (`overflow.frag.glsl`) that gently damps color magnitude with a rim bias only when coverage exceeds a threshold.
  - Controller keeps ink coverage within a target band (default 85–90%).
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
- **Coverage runaway (plate saturates with ink):**
  - New occupancy + overflow controller measures percent pixels inked and applies gentle damping only when coverage > 90%, nudging toward ~85%.
  - Overflow valve preferentially targets highly mixed/speckled areas ("pixel soup") for removal, preserving uniform colors.
  - Low cost (128×128 pass + readback every N frames).
- **Central pooling (ink stuck at center):**
  - Fixed via rotating force emitter that builds up gradually with sustained rotation.
  - Sweeps around center like a sprinkler, pushing ink into rotating flow.
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
 - **Rotation (updated):** `rotationGain = 0.4` (drastically reduced to prevent flood-on-tap).
 - **Central rotating force emitter:**
   - `centralRadius = 0.15` (active zone, 15% of plate)
   - `baseStrength = rotation × 0.25` (force magnitude)
   - Build rate: `0.015` per frame (~1 second to full power)
   - Decay rate: `0.05` per frame (~0.3 seconds to zero)
   - Rotation speed: 3× plate rotation (sweeping pattern)
   - Angular falloff: cosine lobe (focused directional push)
   - Dead zone offset: 90° behind emitter (rotates with force pattern)
 - **Overflow controller:**
   - Target band: `overflowLower = 0.80`, `overflowUpper = 0.90` (fraction of inked pixels).
   - Check cadence: `occupancyEveryN = 8` frames.
   - Overflow strength cap: `0.20` (scaled by overfill amount).
   - Occupancy per-pixel threshold: `0.001` in occupancy shader.
   - Mixed area boost: up to 30% extra damping on speckled regions (coherence-based detection).
 - **Pixel soup measurement:**
   - Real-time tracking of mixed/speckled pixels (coherence < 70%)
   - Logged alongside occupancy percentage for monitoring.

## Adding the Oil Layer (Next)
Goal: Two‑layer system – water (ink carrier) + oil (lens/viscosity layer) with distinct advection/viscosity and coupling at the interface.

### Oil Layer (alpha) – current state
- Data: `oilTexture1/2` RGBA16F (thickness + tint) with `oilFBO`.
- Advection: oil advects by water velocity (no separate oil velocity yet).
- Smoothing: controlled by `simulation.oilSmoothingRate` (separate from ink `diffusionRate`).
- Rendering: `oil-composite.frag.glsl` adds soft refraction (thickness gradient based) and a Fresnel‑ish highlight. Renderer uniforms: `oilRefractStrength`, `oilFresnelPower`.
- UI: materials 1–5, non‑Ink enables Oil; hamburger includes an Oil toggle. Color wheel toned (value/saturation attenuation) to avoid washout.
- Presets (controller): per‑material `oilSmoothingRate`, `absorptionCoefficient`, `paletteDominance`, `oilRefractStrength`, `oilFresnelPower`.

- **Data layout:**
  - `oil` field: start with RGBA16F (thickness, tint) ping‑pong pair and `oilFBO`.
  - Optional: `oilVelocity` RG16F ping‑pong for decoupled motion if needed.
- **Physics:**
  - Higher viscosity: lower vorticity strength and add smoothing (few Jacobi or curvature blur) on oil.
  - Coupling: advect oil by a mix of water velocity and oil velocity (`v_mix = mix(v_oil, v_water, k)`), with k tuned by thickness.
  - Buoyancy-like coupling: thickness gradients add a mild force into water velocity near the interface.
  - Boundary: oil responds less to rim drag; consider reduced rim absorption in oil advection.
- **Rendering:**
  - Use thickness as a lens map for soft refraction and a Fresnel-ish highlight; absorption differs from dye (lower scattering, higher gloss).
- **Order of operations:**
  1. Advect water velocity → viscosity → projection (as now).
  2. Advect oil (by mixed velocity) → oil viscosity/smoothing.
  3. Apply coupling forces (oil→water and/or water→oil).
  4. Advect color by water velocity.
  5. Composite: oil optical effects over color.

- **Conservation & overflow:**
  - Oil layer should have its own occupancy/overflow pass keyed to perceived coverage (thickness-weighted), configured with looser thresholds than ink.
  - Keep passes per-layer so future multi-layer control is independent.

- **Testing:**
  - Unit tests: alias sync for oil, interleaved inking/flow remains true with oil active, occupancy control thresholds, coupling does not introduce NaNs under sustained rotation.

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
