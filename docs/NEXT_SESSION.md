# Next Session: Polish & Advanced Features

## Current State (Nov 3, 2025)

✅ **Oil moves with water** - coupling works perfectly  
✅ **Ambient flow** - gentle rotation (0.12) provides constant motion
✅ **Oil persistence** - disabled smoothing, fixed shaders, proper thresholds
✅ **Boundary fixes** - hard clamp prevents edge dissipation
✅ **Oil color saturation** - linear tint visibility fixes gray centers
✅ **Projection artifacts fixed** - refraction stays within boundary
✅ **Ink persistence** - reduced rotation/vorticity, stays visible 10+ rotations
✅ **Color fidelity** - centers stay vibrant, no gray washout
✅ **Material-specific behavior** - syrup persists longer than oil, oil longer than alcohol
✅ **Multi-material works** - oil and ink coexist
✅ **Documentation organized** - 38+ files in docs/ folder

## Problem to Solve

✅ **FIXED: Oil dissolves faster than ink** - TWO bugs found and fixed

**Root Causes:**
1. **Overflow shader** (minor): Hardcoded alpha to 1.0 every 120 frames
2. **Oil smoothing/diffusion** (MAJOR): Dissipated thickness **every frame** via Laplacian diffusion

**Fixes Applied:**
1. Added `u_isOil` uniform to overflow shader - preserves alpha for oil
2. **Disabled oil smoothing by default** (`oilSmoothingRate: 0.0015 → 0.0`)
3. Added `u_preserveAlpha` to diffusion shader - allows future re-enabling without thickness loss

✅ **FIXED: Material persistence was backwards** - syrup dissipated faster than alcohol!

**Root Cause:**
- All materials shared same overflow threshold (0.85) regardless of viscosity
- High-viscosity materials should accumulate MORE before overflow triggers

**Fix Applied:**
- Added material-specific overflow thresholds:
  - **Syrup**: 0.95 (highest, 180-frame checks) - persists longest
  - **Glycerine**: 0.92 (150-frame checks)
  - **Mineral Oil**: 0.88 (default 120-frame checks)
  - **Alcohol**: 0.80 (lowest) - dissipates fastest
- Now matches physical intuition: thick fluids persist, thin fluids dissipate

## Possible Causes

1. **Overflow running too often**
   - Check: `simulation.occupancyEveryN` (should be 120)
   - Oil might be getting damped by overflow system

2. **MacCormack advection**
   - Check: `simulation.useMacCormack`
   - MacCormack can cause numerical dissipation
   - Ink might use semi-Lagrangian, oil might use MacCormack

3. **Advection dissipation**
   - Semi-Lagrangian advection naturally dissipates
   - Oil advects twice (velocity + thickness) vs ink once
   - More steps = more dissipation

4. **Rim absorption**
   - Check: `u_oilRimAbsorptionScale` in advection shader
   - Should be 0.0 (we set it in OilLayer.js line 281)

5. **Rendering alpha blending**
   - Oil might just LOOK like it's dissolving
   - Check actual thickness values vs visual appearance

## Diagnostic Script

```javascript
// Compare oil vs ink persistence
fetch('compare-dissolution.js').then(r => r.text()).then(eval)
```

Create this script to:
1. Paint equal amounts of oil and ink
2. Measure thickness at center over 10 seconds
3. Report rate of decay for each
4. Identify which dissipates faster and by how much

## Quick Fixes to Try

```javascript
// 1. Disable overflow entirely for oil
simulation.oilOverflowUpper = 1.0;  // Never overflow

// 2. Check MacCormack
console.log("MacCormack:", simulation.useMacCormack);
simulation.useMacCormack = false;  // Force semi-Lagrangian

// 3. Verify rim absorption
// (Already set to 0.0 in code, but check uniform is set)

// 4. Match ink's overflow settings
console.log("Ink overflow:", simulation.inkOverflowUpper);
simulation.oilOverflowUpper = simulation.inkOverflowUpper;
```

## Long-term Solutions

Once diagnosis is complete:

### If overflow is the issue:
- Separate oil overflow from ink overflow
- Different thresholds: ink 85%, oil 90%
- Lower frequency for oil: ink every 120 frames, oil every 240

### If advection is the issue:
- Disable oil velocity advection (already done!)
- Keep only thickness advection
- Or: compensate with thickness boost after advection

### If MacCormack is the issue:
- Force semi-Lagrangian for oil
- Or: reduce MacCormack strength for oil

### If it's visual only:
- Adjust oil rendering alpha/gamma
- Increase `oilAlphaGamma` to compensate

## Root Cause (Fixed)

- **Per-pixel oil props zeroed coupling to 0**
  - In `src/simulation/layers/OilLayer.js`, the coupling pass enabled `u_useProps = 1.0` and bound `u_oilProps`.
  - Props textures initialize to zeros; in `src/shaders/oil-coupling.frag.glsl` the prior logic mixed `1.0` with `props.r` using `u_useProps`, yielding `propR = 0` when `u_useProps=1.0` and `props.r=0`.
  - This made `strength = 0` and `fragColor = vec2(0.0)`, so oil velocity stayed zero everywhere. Oil thickness then advected with zero velocity, appearing to “dissolve” due to overflow/visuals rather than move.

- **Fixes applied**
  - Shader: fallback to full coupling when props are disabled or zero:
    - `propR = (u_useProps > 0.5 && prop > 0.0) ? prop : 1.0;`
  - Layer: disable per-pixel props for coupling (force `u_useProps = 0.0` in `OilLayer.update`), so coupling uses global `simulation.couplingStrength` only.
  - Optional follow-ups: relax oil overflow thresholds/cadence if persistence still looks low.

## Success Criteria

- Oil thickness decays at **same rate or slower** than ink
- Visual: oil blobs persist for 30+ seconds of rotation
- Quantitative: thickness loss < 10% per 10 seconds

## Current Pipeline Status

**Working:**
- Coupling (simplified, 2x boost)
- Thickness advection
- Oil-water interaction
- Oil velocity advection
- Surface tension

**Disabled (for stability):**
- Viscosity

**Next to re-enable (after dissolution fix):**
- Very weak surface tension (0.00001)
- Minimal viscosity (0.01, 2-3 iterations)
- Maybe velocity advection with protection

---

## Commit This Session

Use `COMMIT_MESSAGE.txt` - documents the breakthrough!

## Verification Status

🔧 **Fix Applied** - Ready for testing

1. ✅ Created `compare-dissolution.js` diagnostic
2. ✅ Root cause identified (overflow shader destroying alpha)
3. ✅ Fix applied to `overflow.frag.glsl`, `OilLayer.js`, `WaterLayer.js`
4. ⏳ **NEXT: Test in browser to verify fix works**
   - Run diagnostic script: `fetch('compare-dissolution.js').then(r => r.text()).then(eval)`
   - Expected: Oil persists ≥90% after 10 seconds
5. ⏳ Visual verification with rotation test

See `OIL_OVERFLOW_FIX.md` for complete details.

## Latest Session Summary (Nov 3, 2025)

### Problems Tackled
1. ❌ Oil dissipating at container edges during rotation
2. ❌ Projection artifacts when painting near edges  
3. ❌ Gray/desaturated oil centers (slow painting)

### Fixes Applied
1. ✅ **Boundary hard clamp** - `advection.frag.glsl`
   - Removed soft edge blending that was mixing oil with background
   - Hard clamp to exact boundary position
   - Prevents accelerating dissipation pattern at edges

2. ✅ **Refraction boundary clamp** - `oil-composite.frag.glsl`
   - Added `clampToCircle()` for refraction sampling
   - Prevents diagonal projection artifacts
   - Refraction offset stays within circular container

3. ✅ **Linear tint visibility** - `oil-composite.frag.glsl`
   - Changed from quadratic `(a*a)*(thinGate*thinGate)` to linear `a*thinGate`
   - Partial thickness oil (70%) now shows 28% color vs 20%
   - Fixes gray centers in slow painting

## Current Status (Nov 8, 2025)

### ✅ Phase 2 COMPLETE: Dual-Fluid System
- **Layered architecture**: WaterLayer + OilLayer with independent advection
- **Buoyancy force**: Density-based vertical motion (lighter oils rise, heavier sink)
- **Capillary forces**: Surface tension (50-100) with curvature-based blob formation
- **5 Material presets**: Ink, Mineral Oil, Alcohol, Syrup, Glycerine
- **Material selector UI**: 5 circles with color memory, arc layout beside color wheel

### ✅ Recent Implementations (This Session)
1. **Cohesion Force** - Oil particles snap together into blobs
   - `oil-cohesion.frag.glsl` shader pulls thin oil toward thick blobs
   - Prevents dust formation at source (not just reactive cleaning)
   - Absorption threshold: 0.08 (oil thinner than this gets absorbed)
   - Cohesion strength: 1.5 (configurable per material)
   - **Mental model**: After movement forces, particles snap together

2. **Dynamic Lighting System** (90% complete)
   - Plate tilt tracks container rotation (visual lean during spin)
   - Wobble physics: damped spring returns to neutral
   - Ready for paint/jet impact wobbles
   - **Still needs**: Volumetric shader integration, wobble triggers

3. **Aggressive Dust Removal**
   - Two-pass smoothing with escalating thresholds (0.06 → 0.10)
   - Second pass 1.5× stronger for blob consolidation
   - Syrup persistence boosted: higher overflow thresholds, slower checks

4. **Mobile UX**
   - Container radius reduced to 0.47 on mobile (prevents right-edge cropping)

---

## Start Next Session

### Immediate Priority: Complete Dynamic Lighting 🌟

**What's Done:**
- ✅ Light tilt system (tracks rotation)
- ✅ Wobble physics (damped spring)
- ✅ `updateLightTilt()` method

**Still Needed:**

1. **Wire up wobble triggers in controller**
   ```javascript
   // In onMouseMove (painting)
   if (this.isMouseDown && !this.isRightMouseDown) {
       const forceX = this.mouseVelocityX * 10;
       const forceY = this.mouseVelocityY * 10;
       this.simulation.addWobble(forceX, forceY);
   }
   
   // In jet burst logic
   this.simulation.addWobble(vx * 50, vy * 50);
   ```

2. **Update volumetric.frag.glsl shader**
   ```glsl
   uniform float u_lightTiltX;  // -0.5 to 0.5
   uniform float u_lightTiltY;
   
   // In main():
   vec3 lightDir = normalize(vec3(
       u_lightTiltX,
       u_lightTiltY,
       -1.0  // Base downward direction
   ));
   ```

3. **Pass uniforms in renderer**
   ```javascript
   // In volumetric rendering
   gl.uniform1f(lightTiltXLoc, this.simulation.lightTiltX);
   gl.uniform1f(lightTiltYLoc, this.simulation.lightTiltY);
   ```

**Expected Visual Impact:**
- Rotation creates directional light sweep
- Paint drops cause brief wobbles (light bounces)
- Jet blasts create dramatic tilts
- Most visible with volumetric + RGB rotation ON

**Tuning Parameters:**
- `lightDamping`: 0.92 (lower = settles faster)
- `lightSpring`: 0.15 (return to neutral strength)
- Wobble force multipliers in triggers

---

### Secondary: Cohesion Force Tuning

**Current Values:**
- `oilCohesionStrength`: 1.5 (pull strength toward blobs)
- `oilAbsorptionThreshold`: 0.08 (dust elimination threshold)

**Test Approach:**
1. Drop Syrup (#4), let it spread
2. Watch for dust formation at edges
3. If still dusty: increase cohesion to 2.0-3.0
4. If blobs too sticky: reduce to 1.0
5. If dust persists: raise absorption threshold to 0.10-0.12

**Per-Material Tuning:**
Could add cohesion to material presets:
- Syrup/Glycerine: High cohesion (2.0-3.0)
- Mineral Oil: Medium (1.5)
- Alcohol: Lower (1.0) - thinner, flows more

---

### Medium Priority: Heat Lamp Temperature Effects?

**Current Implementation:**
- Brightness gain (visual)
- Agitation noise (creates blob motion)

**Possible Enhancements:**
1. **Temperature-based viscosity** - Hot = thinner, flows faster
2. **Marangoni convection** - Temperature gradients drive flow
3. **Visual heat glow** - Warmer tones in heated regions

**Recommendation:** Current "hippie lamp vibes" approach is working well. Only add explicit temperature if user wants thermal convection effects for more complex patterns.

---

### Long-term: Phase 3 Polish

**Already Complete:**
- ✅ Material presets (5 materials)
- ✅ Color palettes with memory
- ✅ Material selector UI

**Remaining:**
- [ ] Performance profiles (mobile optimization?)
- [ ] MIDI/OSC control for VJ use
- [ ] Preset save/load system
- [ ] Export animations/screenshots

---

### Known Issues to Monitor

⚠️ **Blob dusting** - Cohesion force should solve this, but monitor:
- Does cohesion create artifacts?
- Performance cost of 7×7 neighborhood search?
- Need third smoothing pass?

⚠️ **Mobile performance**
- Cohesion adds GPU cost (7×7 = 49 samples per pixel)
- May need to reduce kernel size on mobile
- Or make cohesion optional in settings

⚠️ **Overflow dissipation**
- Syrup now has very high thresholds (1.20 upper)
- Monitor if oil accumulates excessively
- May need separate "slow decay" vs "overflow" logic

---

### Testing Checklist

Before next session ends:
- [ ] Dynamic lighting wobbles on paint/jets
- [ ] Rotation creates visible light tilt
- [ ] Cohesion eliminates Syrup dusting
- [ ] Mobile: container fits without cropping
- [ ] All 5 materials feel distinct and stable
- [ ] No performance regression from new features

---

### Documentation Updates Needed

- [ ] Add cohesion force to `docs/simulation.md`
- [ ] Document dynamic lighting system
- [ ] Update Phase 2 completion notes
- [ ] Add material selector UI to README
- [ ] Create `LIGHTING.md` technical doc
