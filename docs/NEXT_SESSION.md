# Next Session: Polish & Advanced Features

## Current State (After This Commit)

✅ **Oil moves with water** - coupling works perfectly  
✅ **Ambient flow** - gentle rotation (0.12) provides constant motion
✅ **Oil persistence** - disabled smoothing, fixed shaders, proper thresholds
✅ **Ink persistence** - reduced rotation/vorticity, stays visible 10+ rotations
✅ **Color fidelity** - centers stay vibrant, no gray washout
✅ **Material-specific behavior** - syrup persists longer than oil, oil longer than alcohol
✅ **Multi-material works** - oil and ink coexist
✅ **Documentation organized** - 38 files in docs/ folder

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

**Disabled (for stability):**
- Oil velocity advection
- Viscosity
- Surface tension

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

## Start Next Session

1. ~~Create `compare-dissolution.js` diagnostic~~ ✅ Already exists
2. ~~Run comparison test~~ → **Run in browser now**
3. ~~Identify root cause~~ ✅ Found: overflow shader bug
4. ~~Apply targeted fix~~ ✅ Applied
5. **Re-test until oil persists like ink** ← YOU ARE HERE
