# Frozen Oil Troubleshooting Guide

## Quick Checklist

If oil is not moving with water:

1. **✅ Did you select Mineral Oil?**
   - Press `2` to switch to Mineral Oil
   - Default is Ink (index 0) which has `couplingStrength = 0`
   - Run `show-current-material.js` in console to verify

2. **✅ Is water actually moving?**
   - Enable rotation (press `R` or click rotation button)
   - Or manually create water movement by clicking/dragging
   - Water should show visible flow patterns

3. **✅ Is there oil present?**
   - Click and drag to create oil blobs
   - Oil should appear as colored areas
   - Check structure view (press `V`) to see oil thickness

4. **✅ Check browser console for errors**
   - Open DevTools (F12)
   - Look for WebGL errors or shader compilation failures
   - Run `check-webgl-errors.js` for detailed diagnostics

## Diagnostic Scripts

Run these in the browser console:

```javascript
// Check current material and coupling strength
// Paste contents of show-current-material.js

// Check for WebGL errors
// Paste contents of check-webgl-errors.js

// Full diagnostic
// Paste contents of diagnose-oil.js
```

## Expected Behavior

### Mineral Oil (Material Index 1)
- **Coupling Strength**: 0.5 (50% water velocity per frame)
- **Viscosity**: 0.1
- **Viscosity Iterations**: 90
- **Behavior**: Oil should visibly move and deform with water flow

### Ink (Material Index 0 - Default)
- **Coupling Strength**: 0.0 (NO coupling)
- **Behavior**: Acts like traditional ink in water, no oil physics

## Common Issues

### Issue: Oil doesn't move at all
**Cause**: Wrong material selected (Ink instead of Mineral Oil)
**Solution**: Press `2` to switch to Mineral Oil

### Issue: Oil moves very slowly or oscillates
**Cause**: Coupling strength too low or viscosity too high
**Solution**: 
- Verify `sim.couplingStrength === 0.5`
- Try reducing viscosity iterations temporarily for testing

### Issue: Oil disappears or behaves strangely
**Cause**: WebGL texture initialization failure
**Solution**: 
- Check console for errors
- Refresh page
- Verify `oilVelocityTexture1` exists

## Technical Details

### Oil Update Pipeline
1. **Advect oil velocity** by itself (semi-Lagrangian)
2. **Apply coupling** from water velocity (blend with coupling strength)
3. **Apply viscosity** (90 iterations of diffusion for mineral oil)
4. **Advect oil thickness** by oil velocity
5. **Apply surface tension** and other forces

### Key Parameters
- `couplingStrength`: 0.0-1.0, how much water influences oil
- `oilViscosity`: Diffusion rate of oil velocity
- `oilViscosityIterations`: Number of smoothing passes

### Shader Files
- `oil-coupling.frag.glsl`: Blends water velocity into oil velocity
- `advection.frag.glsl`: Moves oil and velocity fields
- `viscosity.frag.glsl`: Smooths velocity field

## Fixes Applied

1. ✅ Fixed missing `oilVelocityTexture1` initialization
2. ✅ Upgraded to RG32F format for hardware compatibility
3. ✅ Removed aggressive dt damping in coupling shader
4. ✅ Lowered thickness threshold to 0.001
5. ✅ Added thickness-based coupling modulation

## Still Not Working?

If oil is still frozen after:
- Confirming you're on Mineral Oil (press `2`)
- Seeing water movement (rotation or manual)
- Verifying no WebGL errors
- Refreshing the page

Then there may be a deeper issue. Check:
1. Browser console for any errors
2. Run all diagnostic scripts
3. Try a different browser
4. Check if GPU/WebGL2 is properly supported
