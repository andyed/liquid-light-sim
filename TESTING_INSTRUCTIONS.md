# Testing Instructions: Oil Motion Fix

## Current Status

**Issue**: WebGL feedback loop error (x4) when oil is painted. Oil doesn't move.

**Temporary Fix Applied**: Surface tension force DISABLED in line 238 of `OilLayer.js` to isolate the issue.

## Test 1: Basic Motion (No Surface Tension)

This tests if oil moves with just coupling, without surface tension.

### Steps:
1. **Reload the page** to pick up changes
2. **Open browser console** (F12 or Cmd+Option+I)
3. **Run test script**:
   ```javascript
   // Paste into console:
   fetch('test-oil-motion-basic.js').then(r => r.text()).then(eval)
   ```
4. **Select "Mineral Oil"** from material dropdown
5. **Paint oil blob** in center of container
6. **Click "Rotate"** button
7. **Wait 10 seconds**
8. **Observe**: Does oil move?

### Expected Results:

#### ✅ If Oil Moves:
- **Root Cause**: The new surface tension force shader is creating feedback loop
- **Next Step**: Fix shader texture binding or rewrite force computation
- **Oil should**: Drift with rotation, no cohesion (that's normal without surface tension)

#### ❌ If Oil Doesn't Move:
- **Root Cause**: Problem is earlier in pipeline (coupling or advection)
- **Next Step**: Check coupling strength, debug water→oil velocity transfer
- **Run**: `fetch('final-coupling-test.js').then(r => r.text()).then(eval)`

## Test 2: Check WebGL Errors

### Steps:
1. **Reload page**
2. **Open console**
3. **Check for** "INVALID_OPERATION: Feedback loop" errors
4. **Note when they occur**:
   - During paint/splat?
   - During update?
   - During rendering?

### WebGL Feedback Loop Causes:

A feedback loop means reading from and writing to the same texture. Possible causes:

1. **In `applySurfaceTensionForce`**:
   - Reading from: `oilVelocityTexture1`
   - Writing to: `oilVelocityTexture2`  
   - Should be safe unless textures aren't properly swapped

2. **In old `applySurfaceTension`** (should not be called):
   - Has iterations (could explain "x4")
   - Check if accidentally still being called

3. **In renderer/compositor**:
   - Oil composite shader might be creating loop
   - Check if oil texture is being used while updating

## Test 3: Debug Water Velocity

Oil needs water to be moving to see motion.

### Steps:
```javascript
// In console:
simulation.debugAdvectOilWithWaterVelocity = true;
```

This forces oil to advect using water velocity directly, bypassing coupling.

- **If oil moves**: Coupling strength too low
- **If oil doesn't move**: Advection broken or water not moving

## Quick Diagnostics

### Check if shaders loaded:
```javascript
console.log('Surface tension force shader:', !!simulation.surfaceTensionForceProgram);
console.log('Oil coupling shader:', !!simulation.oilCouplingProgram);
console.log('Advection shader:', !!simulation.advectionProgram);
```

### Check parameters:
```javascript
console.log('Surface tension:', simulation.surfaceTension);
console.log('Coupling strength:', simulation.couplingStrength);
console.log('Oil viscosity:', simulation.oilViscosity);
console.log('Oil drag:', simulation.oilDragStrength);
```

### Force high coupling:
```javascript
simulation.couplingStrength = 0.05; // Very high
simulation.oilViscosity = 0.1; // Very low
simulation.oilViscosityIterations = 10;
```

## Possible Issues & Fixes

### Issue 1: Shader Not Loading
**Symptom**: `surfaceTensionForceProgram` is `undefined`
**Fix**: Check browser console for shader compilation errors

### Issue 2: Texture Swap Bug
**Symptom**: Feedback loop error
**Fix**: Ensure `swapOilVelocityTextures()` is called after each pass

### Issue 3: Coupling Too Weak
**Symptom**: Oil has velocity but very small
**Fix**: Increase `couplingStrength` to 0.01 or higher

### Issue 4: Viscosity Too High
**Symptom**: Oil velocity damped to zero
**Fix**: Reduce `oilViscosity` or `oilViscosityIterations`

## Next Steps Based on Results

### If Basic Test Shows Oil Moving:
1. Re-enable surface tension force (uncomment line 238)
2. Fix feedback loop in surface tension shader:
   - Check texture binding
   - Verify FBO attachment
   - Add error checking
3. Test again with surface tension enabled

### If Basic Test Shows No Motion:
1. Test water velocity: Is container rotating water?
2. Test coupling output: Does coupling add velocity to oil?
3. Test advection: Does advection transport oil thickness?
4. Use existing diagnostic scripts in repo root

## Rollback Plan

If fix doesn't work and you need oil behavior back:

1. **Revert to old surface tension**:
   ```javascript
   // In OilLayer.js line 238, replace with:
   this.applySelfAttraction(dt);
   this.applySurfaceTension(dt);
   ```

2. **Keep it disabled**:
   - Surface tension creates cohesion, not critical for testing motion
   - Can implement proper fix later

3. **Use high coupling** to compensate:
   - Set `couplingStrength = 0.01` for more visible motion
   - Reduce `oilViscosity` for less damping
