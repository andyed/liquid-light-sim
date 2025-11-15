# WebGPU SPH Implementation Plan

## Goal

Move the SPH (oil) simulation to WebGPU so particle dynamics and water/oil coupling are computed entirely on the GPU, eliminating `gl.readPixels` from the hot path and enabling higher particle counts and more realistic blob behavior for the projector-style liquid light show.

Rendering will initially remain in WebGL2; WebGPU will be introduced as a compute backend only.

This implementation plan is now explicitly aligned with the analysis and recommendations in
`docs/Analyzing Liquid Blobbing Simulation Project.md` ("ALBSP"). That document argues
for:

- High interfacial tension (IFT) and high viscosity as *required* for robust, cohesive
  blobs.
- An **implicit inter-particle cohesion (IPF)** model to make those stiff forces
  numerically stable.
- A metaball-style visualization layer to exaggerate merging and compensate for sparse
  particle counts.

The long-term destination of this plan is therefore:

> **WebGPU-based SPH with implicit IPF cohesion, high IFT/high viscosity, and a
>  texture-based metaball field, as outlined in ALBSP.**

---

## Current Status (2025-11)

- **Renderer:** WebGL2-only for now (`useWebGPU = false` in `main.js`).
- **SPH path in production:** CPU SPH + WebGL-only rendering (Phase 1 of ALBSP roadmap).
  - SPH particles are simulated on CPU (`SPHOilSystem`) and rendered via the existing WebGL particle splat + oil composite pipeline.
  - Ink/water render through `WaterLayer → colorTexture1 → Renderer.render`.
- **WebGPU SPH:** Implemented and working in isolation (compute + render pipelines), but **disabled by default** after causing device/OS-level instability on multiple platforms when used with per-frame particle readback.
  - WebGPU context bootstrap and a test compute shader run successfully.
  - WebGPU SPH compute/draw feature flags exist in `OilLayer`, but are currently left `false` in the shipped configuration.
  - On **macOS 26.1 / M3 Max (Chrome WebGPU)**, enabling WebGPU SPH with per-frame full-buffer readback reliably triggers a **WindowServer watchdog timeout** (system compositor crash) after a few seconds under load.
  - On **Windows / NVIDIA (D3D12 backend)**, the same pattern (compute + full-buffer readback every frame) leads to `DXGI_ERROR_DEVICE_HUNG` and a **lost device** during `GPUBuffer.mapAsync` on the staging buffer.
  - Conclusion: the "GPU compute → full particle buffer copy → per-frame CPU readback" design is not viable; SPH must be treated as a GPU-resident backend, with readback reserved for infrequent debugging/telemetry.
- **Debug baseline:** All recent debugging and tuning assume this stable CPU SPH + WebGL renderer baseline.

---

## High-Level Stages

### Stage 0 – Stabilize Current System (Done / Ongoing)

- **Objective:** Make the CPU SPH path workable while GPU SPH is being developed.
- **Key actions (already implemented or in progress):**
  - Disable CPU-side grid velocity sampling (`gl.readPixels`) for Syrup and gate it on rotation for other SPH materials.
  - Make SPH-rendered blob thickness follow local SPH density more explicitly (density → splat alpha → metaball field).
  - Simplify spawn rules so mass differences are real (particle count) without aggressive visual rescaling.

Stage 0 remains as a reference / fallback while GPU SPH is built.

---

### Stage 1 – WebGPU Bootstrap *(Partially Implemented, Currently Disabled)*

**Objective:** Get a WebGPU `device` + `queue` and run a trivial compute shader alongside the existing WebGL2 renderer.

**What’s implemented now:**

- Feature detection and device creation using `navigator.gpu`.
- WebGPU `device`/`queue` successfully initialized and a small test compute shader executed end-to-end (verified via logs).
- WebGPU context plumbed into `Simulation`/`OilLayer` for SPH experiments.

**What is intentionally disabled for stability:**

- WebGPU SPH compute and direct draw-to-canvas are guarded behind feature flags in `OilLayer` and default to **off** after causing a macOS hard crash under load.
- The main renderer is forced into WebGL-only mode; WebGPU is not used in the production render path.

**Remaining tasks for Stage 1:**

1. Wrap WebGPU context creation in stricter guards and error handling for unstable platforms (e.g., macOS + specific GPU/driver combos).
2. Keep WebGPU usage limited to the trivial test compute shader until profiling and safety constraints for SPH are well-understood.
3. Only re-enable WebGPU SPH feature flags under a dedicated debug/experiment build, not in the default interactive experience.

---

### Stage 2 – Move SPH Particle State into WebGPU

**Objective:** Make WebGPU the source of truth for particle state (positions, velocities, densities) while still using the existing WebGL2 SPH rendering.

**Data model:**

- Define a particle struct in WGSL, e.g.:

  ```wgsl
  struct Particle {
    pos : vec2<f32>,
    vel : vec2<f32>,
    density : f32,
    _pad0 : f32,
  };

  struct Particles {
    data : array<Particle>,
  };

  @group(0) @binding(0)
  var<storage, read_write> particles : Particles;
  ```

- On the JS side:
  - Create a `GPUBuffer` with `STORAGE | COPY_DST | COPY_SRC` usage.
  - Upload initial particle data from the current `SPHOilSystem` arrays.

**Tasks:**

1. Buffer layout & creation
   - Decide max particle count (e.g. start with current `maxParticles`).
   - Compute buffer size = `particleStride * maxParticles`.
   - Create and initialize the buffer.

2. Initialization path
   - On SPH init:
     - Copy CPU arrays (`positions`, `velocities`, `densities`, colors) into a staging `Float32Array`.
     - Upload once to the WebGPU storage buffer.
   - After this, treat CPU arrays as secondary / debug; WebGPU owns the live state.

3. Hook into simulation loop
   - Each frame, before rendering:
     - Dispatch WebGPU compute passes that update the `particles` buffer.
   - For now, do a simple readback path (see Stage 3) to keep using the existing WebGL2 SPH renderer.

---

### Stage 3 – Naïve GPU SPH Update Loop (O(N²) Neighbors)

**Objective:** Implement a basic SPH step entirely on GPU, using a simple neighbor loop, to validate physics and data flow before optimizing neighbor search.

**Approach:**

- Start with a single compute shader or 2–3 passes that:
  1. Compute density for each particle (summing over all particles with a kernel).
  2. Compute forces (pressure, viscosity, cohesion, gravity) using those densities.
  3. Integrate velocities and positions.

**Tasks:**

1. Density pass (can be combined with forces for first prototype)
   - For each particle `i` (one invocation per particle):
     - Loop `j` from 0 to `N-1`:
       - Compute squared distance between `pos_i` and `pos_j`.
       - If `r^2 < h^2 * supportRadius^2`, accumulate kernel contribution.
     - Write `density_i` into the particle struct.
   - This is O(N²) and only viable for small N (e.g. 2–5k) but fine for first validation.

2. Pressure + force pass
   - Use Tait equation or similar to compute pressure from density:
     - `p_i = B * ((ρ_i / ρ0)^γ - 1)`. 
   - For the first WebGPU prototype, keep this **explicit** and relatively soft,
     matching the current CPU SPH behavior.
   - For each particle:
     - Loop over neighbors again (for now, all particles):
       - Compute pressure gradient, viscosity, cohesion.
     - Add gravity.
     - Accumulate total force.

3. Integration pass
   - For each particle:
     - `vel_i += (F_i / m) * dt`.
     - `pos_i += vel_i * dt`.
     - Enforce container boundaries.

4. CPU readback for rendering (temporary)
   - At the end of the compute step:
     - Copy the WebGPU buffer to a `MAP_READ` buffer.
     - Map and read positions/velocities/densities back to a `Float32Array`.
     - Copy into the existing CPU arrays and call the current `uploadToGPU()` for SPH rendering.
   - This is not performance-ideal but is sufficient to:
     - Verify the SPH math.
     - Reuse the entire WebGL2 render path without changes.

**Milestone:**

- Oil particles move and interact in a physically plausible way with **no CPU-side SPH math**; only readback is used to feed the WebGL renderer.

---

### Stage 4 – Remove CPU SPH and Improve Data Flow

**Objective:** Stop using CPU particle arrays for anything but optional debugging; make WebGPU the single source of truth without per-frame readback.

**Options:**

1. Port SPH rendering to WebGPU
   - Render particles and thickness directly from the WebGPU buffer (e.g. via a WebGPU render pipeline or compute → texture → WebGL composition).
   - Eventually migrate all oil rendering into WebGPU.

2. WebGPU–WebGL interop (advanced)
   - Investigate platform/browser support for sharing buffers/textures:
     - Use WebGL textures as external textures in WebGPU or vice versa.
   - This is more complex and may be platform-specific; recommended after a pure WebGPU render path exists.

In either case, CPU readback becomes unnecessary and can be removed from the hot path.

---

### Stage 5 – GPU Neighbor Grid / Spatial Hash

**Objective:** Scale beyond small N by replacing the naïve O(N²) neighbor loop with a GPU spatial grid.

**Approach:**

1. Grid build pass
   - Maintain a uniform grid over the container domain.
   - For each particle:
     - Compute its grid cell index.
     - Append its index into a per-cell list (using atomics or pre-allocated slots + a counter buffer).

2. SPH passes with grid
   - For each particle:
     - Look up its cell and the 8 neighboring cells.
     - Loop over the indices stored in those cells instead of all particles.
   - This recovers O(N · k) behavior (k = average neighbors), similar to the current CPU `SpatialHashGrid`.

3. Tuning & validation
   - Confirm that density / pressure / forces with the grid version match the naïve O(N²) version for small N.
   - Gradually increase particle count to your desired range.

---

### Stage 6 – GPU Water/Oil Coupling

**Objective:** Move oil–water interaction fully onto the GPU, eliminating all CPU coupling.

**Tasks:**

1. Oil → grid (GPU)
   - From SPH particles, splat:
     - Oil thickness into a grid texture.
     - Optional oil velocity into a velocity texture.
   - This is the GPU equivalent of `writeVelocitiesToGrid` and the current SPH render-to-texture step.

2. Water → oil (GPU)
   - In the SPH force pass:
     - Sample water velocity from the grid textures at particle positions.
     - Apply drag / coupling forces entirely on GPU.

3. Water update
   - The existing grid-based water update remains on GPU.
   - It now incorporates oil-induced forces via the oil grid textures.

At this stage, there is **no CPU mediation** in SPH or coupling.

---

### Stage 7 – Implicit IPF Cohesion (ALBSP Phase 1)

**Objective:** Follow ALBSP's recommendation to replace the current explicit cohesion
with an implicit Inter-Particle Force (IPF) model on the GPU so we can safely use high
IFT and high viscosity without explosions.

This is where the project transitions from "soft, explicit SPH" to
"stiff, physically-inspired blobs".

**High-level tasks (adapted from ALBSP §4.2, §7):**

1. **Define IPF cohesion term in WGSL**
   - Add a pairwise, attractive force between oil particles within a narrow band
     around the interface (same-phase only).
   - Implement this as an additional force term `F_ipf` in the SPH force pass, but
     treated implicitly in the time integration.

2. **Implicit integration of cohesion (backward Euler / linearized solve)**
   - Switch from fully explicit updates for cohesion to a simple implicit scheme
     (e.g. linearized backward Euler) as described in ALBSP's references
     (Jeske et al. 2023).
   - Couple cohesion with pressure and viscosity in the per-step solve so we can
     safely raise IFT and viscosity coefficients.

3. **Parameter tuning in WebGPU regime**
   - Gradually increase the effective surface tension / cohesion strength until
     blobs:
     - Rapidly spheroidize after perturbation.
     - Aggressively merge when touching.
     - Strongly resist breakup except under large rotational/thermal forcing.

4. **Align CPU SPH with IPF where feasible**
   - For development/debug, keep a soft, explicit approximation of the IPF
     behavior on CPU (what we are currently tuning) so behavior differences between
     CPU and GPU paths are minimized.

### Stage 8 – Metaball Visualization Alignment (ALBSP Phase 3)

**Objective:** Ensure the WebGL/WebGPU oil visualization behaves like a metaball
field as described in ALBSP §5, exaggerating merging between nearby blobs and
making contiguous oil regions visually continuous.

**Tasks:**

1. **Match SPH density field to metaball field**
   - Confirm that the scalar used for oil thickness / implicit field is directly
     derived from the SPH density / particle influence, so high-density regions
     render as a single coherent blob.

2. **Tunable blending for exaggerated coalescence**
   - Introduce a blending parameter (Ricci-style or equivalent) in the shader that
     controls how quickly separate blobs visually merge as their fields overlap.
   - For the projector aesthetic, bias this toward *early* merging so nearby blobs
     form a continuous sheet even at moderate distances.

3. **WebGPU-native metaball path (future)**
   - Once SPH and coupling are fully on WebGPU, consider a pure WebGPU metaball
     rendering path (computing the implicit field in WGSL and feeding it to either
     WebGPU or WebGL). This is optional but aligns with ALBSP's GPU metaball
     recommendations.

---

## Implementation Notes

- Start with **WebGPU as compute-only**, keeping WebGL2 rendering intact.
- Use a **small particle count** (e.g. 1–3k) for the naïve neighbor version to validate correctness.
- Keep the code modular:
  - Separate JS modules for WebGPU context, SPH buffers, and SPH compute pipelines.
  - Separate WGSL files for density, forces, and integration.
- Defer gravity/pressure tuning until GPU SPH is stable and density-driven thickness is wired up; then tune parameters in a physically meaningful way.

---

## Next Concrete Steps

1. Implement WebGPU context creation and a trivial compute shader (Stage 1).
2. Define the particle struct and storage buffer, and copy initial SPH state into it (Stage 2).
3. Implement a minimal O(N²) GPU density + integration pass and feed positions back into the existing WebGL SPH rendering (Stage 3).
4. Once the above is working, plan the neighbor grid and full GPU coupling stages.
