# Emergency Debug - Oil Thickness is ZERO

## The Problem

After all fixes, oil thickness reads **0.0** immediately after painting.

```javascript
Max oil thickness: 0
Oil smoothing: 0
Occupancy: 0.0%
```

This means either:
1. Oil splat function not being called
2. Oil is painted but immediately cleared
3. Shader bug preventing oil from writing

## What We Know

✅ **Smoothing disabled** - `oilSmoothingRate = 0`  
✅ **Overflow not triggering** - occupancy 0%  
✅ **No auto-clear** - checked code, nothing clears oil during operation  
❌ **Oil thickness = 0** - oil literally not in texture

## Immediate Steps

### 1. Add Logging (DONE)
Added console logs to `OilLayer.splatColor()`:
- Entry log with parameters
- Exit log after draw

**Test:** Paint syrup, check console for:
```
🛢️ OilLayer.splatColor called: {x, y, radius, color}
  ✓ Oil splat drawn, textures swapped
```

If these DON'T appear → splat function not being called at all  
If these DO appear → splat runs but doesn't write thickness

### 2. Check Material Selection
```javascript
console.log('Current material index:', controller.currentMaterialIndex);
console.log('Material name:', controller.materials[controller.currentMaterialIndex].name);
console.log('Is oil?:', controller.currentMaterialIndex !== 0);
```

Should show:
- Index: 4 (for Syrup)
- Name: "Syrup"
- Is oil: true

### 3. Verify Shader Program
```javascript
console.log('Splat program:', simulation.splatProgram);
console.log('Oil FBO:', simulation.oil.oilFBO);
console.log('Oil texture1:', simulation.oil.oilTexture1);
```

All should be non-null.

### 4. Check Controller Paint Logic
In `src/controller.js` around line 809-817:

```javascript
const isInk = this.currentMaterialIndex === 0;
if (isInk) {
    // Paint ink into water layer
    this.simulation.splat(x, y, this.currentColor, 0.08);
} else if (this.simulation.useOil && this.simulation.oil) {
    // Paint oil only (no additional ink), using current color as oil tint
    const oilRadius = 0.06;
    this.simulation.oil.splatColor(x, y, this.currentColor, oilRadius);
}
```

Check:
```javascript
console.log('isInk:', isInk);
console.log('useOil:', simulation.useOil);
console.log('oil exists:', !!simulation.oil);
```

### 5. Test Splat Shader Directly
```javascript
// Force paint oil manually
const sim = window.simulation;
const oil = sim.oil;
if (oil) {
  oil.splatColor(0.5, 0.5, {r: 1, g: 0.5, b: 0}, 0.1);
  console.log('Manually painted oil at center');
  
  // Wait 100ms then check
  setTimeout(() => {
    const gl = sim.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, oil.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oil.oilTexture1, 0);
    const px = new Float32Array(4);
    const cx = Math.floor(gl.canvas.width / 2);
    const cy = Math.floor(gl.canvas.height / 2);
    gl.readPixels(cx, cy, 1, 1, gl.RGBA, gl.FLOAT, px);
    console.log('Center pixel after manual splat:', px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }, 100);
}
```

If still zero → shader bug or FBO issue  
If non-zero → controller routing bug

## Possible Root Causes

### Theory 1: Material Switch Clears Oil
Check if switching to Syrup triggers a clear. The code shows clearing is COMMENTED OUT but verify it's not running.

### Theory 2: Oil Not Enabled
```javascript
console.log('useOil:', simulation.useOil);
console.log('oil object:', simulation.oil);
```

### Theory 3: Shader Compilation Error
```javascript
console.log('Splat shader:', simulation.splatProgram);
// Check for WebGL errors
const err = gl.getError();
if (err !== gl.NO_ERROR) {
  console.error('WebGL error:', err);
}
```

### Theory 4: FBO Attachment Issue
Oil might be painting to wrong attachment or texture isn't bound correctly.

### Theory 5: Texture Swap Bug
```javascript
// After painting, check which texture is active
console.log('Active oil texture is texture1?:', oil.oilTexture1 === oil.oilTexture1);
```

If textures get swapped wrong, we might be reading empty texture while painting went to other.

## Nuclear Option

If nothing works, try:
1. Disable advection temporarily - paint oil, don't update simulation
2. Check if MacCormack advection has bug clearing oil
3. Check if coupling step is clearing oil velocities which then clears thickness

## Next Steps

1. **Reload page** with logging added
2. **Paint syrup** and watch console
3. **Check logs** appear
4. **Report** what you see in console

If logs don't appear, painting isn't reaching OilLayer at all - controller bug.  
If logs appear but thickness still 0, shader/FBO bug.
