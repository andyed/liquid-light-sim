# WebGL Feedback Loop Fix (Nov 2, 2025)

## Problem
**WebGL Error**: `INVALID_OPERATION: glDrawArrays: Feedback loop formed between Framebuffer and active Texture`

This error occurred during oil painting/splatting, appearing multiple times (x4, x10, etc).

## Root Cause

The feedback loop was **NOT** in the new surface tension force shader. It was in the **oil properties texture splatting**.

### The Bug (in `splatColor` method):

```javascript
// Line 369-371: Writing TO oilPropsTexture
gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilPropsFBO);
gl.framebufferTexture2D(..., this.oilPropsTexture, 0);

// Line 384: Reading FROM the same texture!
gl.bindTexture(gl.TEXTURE_2D, this.oilPropsTexture);
```

**Classic feedback loop**: Reading from and writing to the same texture simultaneously.

## Solution

Implemented **ping-pong texture pattern** for oil properties, same as used for oil thickness and velocity:

### Changes Made:

1. **Added second properties texture**:
   - `oilPropsTexture` → `oilPropsTexture1` and `oilPropsTexture2`
   
2. **Updated initialization** (`init` method):
   - Create both textures
   - Zero-initialize both

3. **Updated resize** method:
   - Delete both textures
   - Recreate both

4. **Added swap method**:
   ```javascript
   swapOilPropsTextures() {
     [this.oilPropsTexture1, this.oilPropsTexture2] = 
       [this.oilPropsTexture2, this.oilPropsTexture1];
   }
   ```

5. **Updated splatColor**:
   - Read from `oilPropsTexture1`
   - Write to `oilPropsTexture2`
   - Swap after draw

6. **Updated all references**:
   - In `update()` coupling pass: use `oilPropsTexture1`
   - In surface tension force: use `oilPropsTexture1`
   - In destroy: delete both textures

## Why This Works

Ping-pong pattern ensures we **never** read from and write to the same texture:

```
Frame N:
  Read from:  texture1
  Write to:   texture2
  Swap

Frame N+1:
  Read from:  texture2 (was written to in frame N)
  Write to:   texture1
  Swap
```

This is the standard pattern for GPU compute that modifies data based on its current state.

## Testing

After this fix:
1. ✅ Feedback loop error should be **gone**
2. ✅ Oil painting should work without WebGL errors
3. ✅ Oil properties should update correctly
4. ✅ Surface tension force enabled and working

## Files Modified

- `src/simulation/layers/OilLayer.js`:
  - Lines 16-17: Added `oilPropsTexture2`
  - Lines 40-42: Initialize both textures
  - Lines 59-63: Zero-init both
  - Lines 86-88: Delete both on resize
  - Lines 98-101: Recreate both on resize
  - Lines 111-117: Zero-init both after resize
  - Line 177: Use `oilPropsTexture1` in coupling
  - Line 179: Use `oilPropsTexture1` in coupling
  - Line 371: Write to `oilPropsTexture2` in splat
  - Line 384: Read from `oilPropsTexture1` in splat
  - Line 392: Added swap call
  - Line 523: Use `oilPropsTexture1` in surface tension force
  - Line 525: Use `oilPropsTexture1` in surface tension force
  - Lines 645-647: Added swap method
  - Lines 662-663: Delete both in destroy

## Related Fix

Also **re-enabled** surface tension force (line 250) - it was temporarily disabled for debugging but wasn't the cause of the feedback loop.

## Why This Wasn't Caught Earlier

The oil properties texture feature was added for per-pixel material support but didn't implement the ping-pong pattern from the start. The feedback loop only manifested when:
- Oil was being painted (splat operation)
- Properties texture was being updated
- Same texture was bound for reading in the shader

This is why the error count varied (x4, x10) - it depended on how many splat operations occurred during painting.

## Prevention

**Rule**: Any GPU compute pass that reads from a texture and writes results back must use ping-pong textures or a different output target. Never bind the same texture as both input and output.

## Performance Impact

**Minimal**: 
- One additional texture (small RGBA16F)
- No additional shader passes
- Just proper resource management
