# Frozen Oil Bug Fix - Complete Resolution

## Problem
Oil blobs were completely frozen and not moving with water flow, despite water velocity being present.

## Root Causes Identified

### 1. **Critical: Missing Texture Initialization** ✅ FIXED
**File:** `src/simulation/layers/OilLayer.js`
- `oilVelocityTexture1` was never created in `init()` and `resize()` methods
- Only `oilVelocityTexture2` was initialized
- This caused undefined behavior when trying to read/write oil velocity

**Fix:**
```javascript
// Added in both init() and resize():
this.oilVelocityTexture1 = this.sim.createTexture(w, h, gl.RG32F, gl.RG, gl.FLOAT);
this.oilVelocityTexture2 = this.sim.createTexture(w, h, gl.RG32F, gl.RG, gl.FLOAT);
```

### 2. **Critical: Overly Aggressive Coupling Damping** ✅ FIXED
**File:** `src/shaders/oil-coupling.frag.glsl`
- Original code: `effectiveCoupling = min(effectiveCoupling * u_dt, 0.1)`
- With `couplingStrength = 0.5` and `dt = 0.016`, this resulted in `0.008` effective coupling
- Oil only received 0.8% of water velocity per frame - far too weak to be visible

**Fix:**
```glsl
// Removed dt multiplication (dt is handled in advection step)
// Changed from: effectiveCoupling = min(effectiveCoupling * u_dt, 0.1);
// To: effectiveCoupling = clamp(effectiveCoupling, 0.0, 1.0);
```

Now with `couplingStrength = 0.5`, oil gets 50% of water velocity blended in per frame.

### 3. **Hardware Compatibility Improvement** ✅ FIXED
**File:** `src/simulation/layers/OilLayer.js`
- Upgraded from `RG16F` (half-float) to `RG32F` (full-float) for oil velocity textures
- Prevents texture format inconsistencies across different GPUs/drivers

### 4. **Minor: Thickness Threshold** ✅ FIXED
**File:** `src/shaders/oil-coupling.frag.glsl`
- Lowered threshold from `0.005` to `0.001` to capture thinner oil films

## Verification

### Expected Behavior After Fix
1. Oil blobs should visibly move when water flows around them
2. Coupling strength of 0.5 for mineral oil should show strong interaction
3. Oil should follow water currents while maintaining cohesion
4. No WebGL errors in console

### Testing Steps
1. Open http://localhost:8080
2. Press `2` to select Mineral Oil
3. Click and drag to create oil blobs
4. Create water movement (click/drag elsewhere)
5. Oil should now move with water flow

### Diagnostic Tools
- Run `diagnose-oil.js` in browser console to check simulation state
- Check that `oilVelocityTexture1` exists
- Verify `couplingStrength = 0.5` for mineral oil
- Monitor for WebGL errors

## Files Modified
1. `src/simulation/layers/OilLayer.js` - Fixed texture initialization, upgraded to RG32F
2. `src/shaders/oil-coupling.frag.glsl` - Fixed coupling damping logic
3. `src/main.js` - Exposed controller to window for debugging

## Material Parameters (Mineral Oil)
```javascript
{
  name: 'Mineral Oil',
  couplingStrength: 0.5,      // Strong water-oil coupling
  oilViscosity: 0.1,           // Low viscosity
  oilViscosityIterations: 90,  // Moderate smoothing
  // ... other parameters
}
```

## Related Documentation
- See `v1.0-end-game.md` for Phase 1 goals
- See `test-oil-fixes.js` for automated validation
- See `diagnose-oil.js` for runtime diagnostics
