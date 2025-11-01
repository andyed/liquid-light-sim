# Oil Velocity Field Implementation (Prerequisite 1)

## What Was Implemented

Added **separate oil velocity field** to enable independent oil motion, replacing the previous system where oil was passively advected by water velocity.

## Key Changes

### 1. OilLayer.js - New Textures & Resources

**Added:**
- `oilVelocityTexture1/2` (RG16F ping-pong pair)
- `oilVelocityFBO` (framebuffer for writes)
- `swapOilVelocityTextures()` method

**Memory:**
- 2 × RG16F textures at full resolution
- ~2× memory increase for oil layer (acceptable)

### 2. New Shader: oil-coupling.frag.glsl

**Purpose:** Blends water velocity into oil velocity with thickness-dependent coupling.

**Algorithm:**
```glsl
coupling_factor = strength * (0.8 - 0.5 * smoothstep(0.0, 0.3, thickness))
// thin oil (th=0.0) → coupling = 0.8 (80% water-driven)
// thick oil (th=0.3+) → coupling = 0.3 (30% water-driven)

force = (v_water - v_oil) * coupling
v_oil_new = v_oil + force * dt * 2.0
```

**Key feature:** Oil with no thickness copies water velocity exactly (for stability in empty regions).

### 3. Updated OilLayer.update(dt) Pipeline

**New 4-step process:**

1. **Advect oil velocity by itself** (semi-Lagrangian)
   - Velocity field advects by itself
   - Preserves momentum in oil layer
   - Uses `u_isVelocity = 1` (no MacCormack)

2. **Apply water coupling**
   - Use `oil-coupling.frag.glsl`
   - Blends water influence based on thickness
   - Creates momentum exchange between layers

3. **Advect oil thickness by oil velocity**
   - Oil now moves by its own velocity field
   - Independent from water motion
   - Preserves MacCormack/limiter for color

4. **Optional smoothing** (unchanged)
   - Oil-specific diffusion for cohesion
   - Controlled by `sim.oilSmoothingRate`

### 4. Simulation.js - Shader Loading

Added:
```javascript
this.oilCouplingProgram = this.renderer.createProgram(
    fullscreenVert,
    await loadShader('src/shaders/oil-coupling.frag.glsl')
);
```

### 5. Implemented splatVelocity()

Oil layer can now receive velocity impulses (jets, user input).

## Expected Behavior Changes

### Before (water-driven oil):
- Oil moved exactly like water
- No viscosity difference visible
- Instant response to water motion
- No independent oil dynamics

### After (separate velocity):
- Oil has inertia and momentum
- Responds slowly to water motion (coupling lag)
- Thick oil more independent than thin oil
- Foundation for viscosity differences (Prerequisite 2)

## Testing Checklist

- [x] Shader compiles without errors
- [ ] Oil advects smoothly without artifacts
- [ ] Oil responds to rotation (delayed compared to water)
- [ ] Thick oil blobs move more independently
- [ ] Thin oil follows water more closely
- [ ] No NaN/corruption in velocity field
- [ ] Performance acceptable (separate advection adds cost)

## Performance Impact

**Added GPU passes per frame:**
- 1× velocity advection (RG16F, semi-Lagrangian)
- 1× coupling pass (3 texture reads)

**Estimated cost:** ~15-20% increase in oil layer update time.
**Acceptable:** Oil layer is optional and already cheap compared to water.

## Next Steps (Prerequisite 2)

Add **oil-specific viscosity** to the oil velocity field:
- Apply Jacobi viscosity solver to `oilVelocity`
- Use material-specific iteration counts (25-120× water)
- Lower/disable vorticity for oil (high viscosity damps swirls)
- Creates characteristic slow, smooth oil flow

See: `docs/marangoni-implementation.md` → Prerequisite 2

## Technical Notes

### Why Semi-Lagrangian for Oil Velocity?

Oil velocity uses `u_isVelocity = 1` which disables MacCormack:
- Semi-Lagrangian is unconditionally stable
- Higher viscosity will damp high-frequency detail anyway
- No need for MacCormack's sharpening (appropriate for low-Re flow)
- Matches water layer's velocity advection strategy

### Coupling Strength Tuning

Current: `u_couplingStrength = 1.0` (full strength)

**Can tune per-material:**
- Light oils: 1.2-1.5 (more water-responsive)
- Heavy oils: 0.6-0.8 (more independent)
- Controlled in material presets (future)

### Memory Layout

```
OilLayer resources:
├── oilTexture1/2 (RGBA16F)       // thickness + tint
├── oilFBO
├── oilVelocityTexture1/2 (RG16F) // NEW: velocity field
└── oilVelocityFBO                 // NEW
```

Total: 6 textures, 2 FBOs (was 3 textures, 1 FBO)

## Bug Fixes Applied

**Issue:** Fragment shader used `in vec2 v_uv;` but fullscreen vertex shader outputs `v_texCoord`.

**Fix:** Changed all `v_uv` → `v_texCoord` in `oil-coupling.frag.glsl`.

**Error was:**
```
FRAGMENT varying v_uv does not match any VERTEX varying
```

**Resolution:** Shader now links correctly.
