# Marangoni Flow Implementation (Design)

This document specifies how to implement Marangoni flow in the current layered architecture (Simulation, WaterLayer, OilLayer, Renderer). It replaces earlier generic notes and aligns with the codebase as of the OilLayer/refraction milestone.

## 1) Concept

Marangoni flow is lateral motion along an interface driven by gradients of effective surface tension σ. In our 2D setup, we approximate σ as a function of oil thickness and optionally a surfactant/temperature proxy. Flow direction is toward higher σ along the interface.

## 2) Signals and fields

- Oil thickness/tint field: `O(x,y)` lives in `OilLayer.oilTexture1` (RGBA16F). We use luminance of RGB as thickness proxy: `th = dot(oil.rgb, vec3(1/3))`.
- Optional scalar S(x,y): future extension (surfactant/temperature). For V1 use thickness-only.
- Water velocity: `velocityTexture1` in WaterLayer/Simulation.

## 3) Surface tension model

V1 thickness-only model:

σ(th) = σ0 + k_th * th

where σ0 is a constant per material and k_th is a gain. Gradients of σ reduce to k_th * ∇th. This keeps the shader simple and stable.

Per-material parameters (examples):
- Mineral Oil: k_th = 0.8
- Alcohol: k_th = 0.4
- Syrup: k_th = 1.0
- Glycerine: k_th = 1.2

## 4) GPU kernel (marangoni.frag.glsl)

Inputs:
- `u_velocity` (water velocity, RG16F or RGBA16F)
- `u_oil` (oil field RGBA16F)
- `u_dt`, `u_resolution`, `u_strength`, `u_edgeBand` (pixels), `u_k_th`

Output:
- Updated velocity (additive) written to a ping‑pong FBO (same format as velocity)

Algorithm (pseudo‑GLSL):

```glsl
#version 300 es
precision highp float;
in vec2 v_uv; out vec2 fragVel; // or vec4 if velocity RGBA
uniform sampler2D u_velocity;
uniform sampler2D u_oil;
uniform vec2 u_texel;          // 1.0 / resolution
uniform float u_dt;
uniform float u_strength;      // global scale (material)
uniform float u_edgeBand;      // pixels in screen space (convert to uv)
uniform float u_k_th;          // thickness-to-sigma gain

float thickness(vec3 c){ return dot(c, vec3(0.3333)); }

void main(){
  // Read velocity
  vec2 v = texture(u_velocity, v_uv).xy;

  // Thickness and gradient (central differences)
  float thC = thickness(texture(u_oil, v_uv).rgb);
  float thL = thickness(texture(u_oil, v_uv - vec2(u_texel.x, 0.0)).rgb);
  float thR = thickness(texture(u_oil, v_uv + vec2(u_texel.x, 0.0)).rgb);
  float thD = thickness(texture(u_oil, v_uv - vec2(0.0, u_texel.y)).rgb);
  float thU = thickness(texture(u_oil, v_uv + vec2(0.0, u_texel.y)).rgb);
  vec2 gradTh = vec2(thR - thL, thU - thD) * 0.5;

  // Edge mask: activate near interface (|gradTh| band)
  float g = length(gradTh);
  float px = max(u_texel.x, u_texel.y);
  float edge = smoothstep(0.0, (u_edgeBand*px), g);

  // Marangoni force along interface toward higher sigma
  vec2 Ft = normalize(gradTh + 1e-6) * (u_k_th);
  // Scale and clamp for stability
  float clampMag = 0.05; // tuned
  vec2 deltaV = clamp(Ft * (u_strength * u_dt) * edge, vec2(-clampMag), vec2(clampMag));

  fragVel = v + deltaV;
}
```

Notes:
- We act tangentially with the gradient direction; for thickness‑only σ this is adequate. If we add explicit normals, we can project to along‑interface directions, but in practice the above yields the desired rim flows.
- `edge` gates force to interface regions to avoid bulk acceleration.

## 5) Integration points

Where: `WaterLayer.update(dt)` after `applyForces(dt)` and before viscosity/pressure projection:

1. Bind velocity ping‑pong FBO, attach write target.
2. Use `marangoniProgram` with inputs: current `velocityTexture1`, `oil.oilTexture1`, uniforms as above.
3. Draw fullscreen quad, then swap velocity textures.
4. Continue with viscosity and pressure passes as-is.

Rationale: adding force before projection lets the solver remove any divergence introduced by the Marangoni kick.

## 6) Parameters and presets

Add to material presets (controller):
- `marangoniStrength` (maps to `u_strength`)
- Optional: `k_th` per material
- Suggested defaults:
  - Mineral Oil: strength 0.45, k_th 0.8, edgeBand 2.0
  - Alcohol: strength 0.25, k_th 0.4, edgeBand 1.5
  - Syrup: strength 0.60, k_th 1.0, edgeBand 2.5
  - Glycerine: strength 0.70, k_th 1.2, edgeBand 3.0

Global safeguards:
- Clamp force magnitude per‑pixel (see `clampMag`).
- Optionally low‑pass the oil field once before gradient (we already have oil smoothing; reuse that).

## 7) API additions

- Simulation loads `marangoni.frag.glsl` into `this.marangoniProgram`.
- WaterLayer gets a method `applyMarangoni(dt)` invoked inside `update(dt)`.
- Controller passes per‑material parameters into `simulation` on selection.

## 8) Testing

- Unit style (test runner):
  - Ensure program links and uniforms resolve.
  - Zero oil → no velocity change.
  - Single oil edge stripe → velocity increases along gradient and is finite.
- Visual:
  - Deposit two blobs of different materials; observe outward spreading of low‑σ oil around high‑σ oil (peacock/feather edges).
  - Same material twice → minimal effect.

## 9) Future extensions

- Introduce a surfactant/temperature scalar `S(x,y)` with advection/diffusion and use σ(th,S) = σ0 + k_th th + k_s S.
- Couple Marangoni only to the oil layer velocity when we add a dedicated `oilVelocity` field, then mix with water via a coupling factor.

---

Implementation order:
1) Add shader + program load, integrate `applyMarangoni(dt)` in WaterLayer.
2) Wire per‑material params (strength, k_th, edgeBand) in controller presets.
3) Tune `clampMag`, `edgeBand`, and strengths to avoid ringing and ensure stable, organic rim flows.

## 10) Marangoni bursting and beading (phenomenology)

In classic light shows, slow fragmentation and beading arise from "Marangoni bursting" involving three liquids:

- Base liquid (high σ): the oil layer (e.g., mineral oil).
- Droplet mixture (variable σ): water + lower‑σ alcohol (IPA/ethanol) + dye.

Mechanism sketch for visuals we aim to emulate:
- Alcohol evaporates fastest at droplet edges, increasing σ at the rim relative to the center.
- The resulting σ gradient drives outward Marangoni flow from center to rim.
- Radial fingers form and become unstable, fragmenting into beads/secondary droplets.

Practical V1 in this codebase:
- We approximate σ(th) from oil thickness and inject interface forces into water (Section 4/5), which produces outward shear and feathering along oil–ink boundaries. A dedicated volatile field C(x,y) could later reproduce rim‑biased σ changes and time‑varying bursts.

Future extension for bursting:
- Add a scalar `C` (alcohol/surfactant) with advection/diffusion/evaporation. Use σ(th,C) = σ0 + k_th th + k_c C and add an edge‑biased evaporation term to increase σ at rims over time, promoting fingering and bead breakup.

## 11) Peacock visuals and thermal option

The slow, dendritic "peacock" patterns can be modeled as a continuous σ disturbance rather than discrete droplets:
- Continuous injection: introduce a local σ change (via color tool or a hidden surfactant tap) to seed spreading flow that shears colored regions.
- Thermal Marangoni (optional): projector heat creates ∇T with dσ/dT < 0, causing flow away from hot spots.

How to add later:
- Add a simple temperature field T(x,y) with a heat source at light indicator; define σ(th,T) with dσ/dT < 0 and couple ∇σ(T) into the same Marangoni pass (extra gradient term).

## 12) VJ implementation paths (and what we chose)

Two practical routes:
- Physics‑based (heavier): full Navier‑Stokes with explicit surfactant/temperature PDEs and interfacial stress. Highest fidelity, higher cost.
- Texture/shader‑based (real‑time): derive forces and displacement from available fields and procedural noise.

What we implemented in V1:
- A shader‑based Marangoni pass that uses the oil thickness gradient to add an interface force to water velocity (cheap and stable) and an oil composite pass for soft refraction/occlusion.

Possible visual boosters (still shader‑based, real‑time):
- Add low‑frequency fractal noise as a small perturbation to σ before taking ∇ to mimic thermal convection shimmer.
- Add a light evaporation mask near edges (precompute from |∇th|) to slowly strengthen σ at rims.

## 13) PRD: Heat Lamp (Critical Component)

Goal: Make a projector/heat‑lamp a first‑class control that affects both brightness and motion.

- Levels: Low, Medium, High.
- Brightness: multiplicative gain applied post‑composite. Suggested: Low 1.0, Med 1.25, High 1.6.
- Motion/Agitation: adds a small background perturbation scaled by level. Two dials:
  - Base agitation to velocity (white‑noise curl or low‑freq swirl): Low 0.0, Med 0.01, High 0.03.
  - Thermal coupling to Marangoni: effective k_th *= (1 + k_T·T) with k_T < 0 if dσ/dT < 0. For V1, use a global scalar T ∈ {0.0, 0.5, 1.0}.
- UI: hamburger toggle with three buttons; shows current level in status HUD.

V2 thermal field plan:
- Add T(x,y) centered at the light indicator with slow diffusion and advection.
- Coupling: σ(th,T) = σ0 + k_th·th + k_T·T, dσ/dT < 0.
- Debug: heat map overlay and ∇T arrows.

## 14) Rendering: Color Wheel as Tint‑Only

Rationale: Light intensity should come from the heat lamp. The color wheel selects dye tint only.

- Change: color wheel sets only the tint of injected ink/oil; it does not boost brightness.
- Brightness pipeline: apply heat‑lamp gain after volumetric + oil composite.
- Materials may still define absorption; lamp gain multiplies final color.

Implementation checklist:
- Add `heatLampLevel` with three presets and expose in hamburger.
- Renderer: add `brightnessGain` uniform fed by heat lamp.
- Add small base agitation term gated by lamp level.
- Update HUD to show lamp level along with Marangoni params and current view.
