# Alcohol (Key 3) Fix - Nov 9, 2025

## Problem
When pressing key 3 (Alcohol) and painting:
- **Existing ink disappeared** (screen went blank)
- **New ink couldn't be added** (painted but invisible)
- The entire scene was darkened

## Root Cause
Alcohol (Grid layer) was being processed through the oil-composite shader, which:
1. Was designed for SPH blobs (Mineral Oil, Syrup, Glycerine)
2. Applied occlusion, refraction, and color effects
3. Darkened areas with any oil content (even very thin Alcohol)

The rendering pipeline was:
```
Alcohol painted to gridTexture
  ↓
Composited to compositedTexture  
  ↓
Copied to oilTexture1
  ↓
Oil-composite shader applied to entire scene ❌ (PROBLEM!)
  ↓
Ink darkened/invisible
```

## Solution

### 1. Skip Oil-Composite for Alcohol-Only
**File**: `src/simulation/layers/OilLayer.js`

Added `hasVisibleOilContent()` method:
```javascript
hasVisibleOilContent() {
  return this.useSPH && this.sph.particleCount > 0;
}
```

Only copy to `oilTexture1` when there are SPH particles:
```javascript
// LEGACY: Copy to oilTexture1 ONLY if there are SPH particles
// Alcohol (Grid layer only) should NOT be copied to oilTexture1
if (hasSPHParticles && this.compositedTexture) {
  // Copy composited texture
} else {
  // Clear oilTexture1 to prevent blocking ink
}
```

### 2. Skip Oil-Composite Shader in Renderer
**File**: `src/renderer.js`

```javascript
const hasVisibleOil = this.simulation.oil && this.simulation.oil.hasVisibleOilContent();

if (this.simulation.useOil && hasVisibleOil && this.oilCompositeProgram) {
  // Only run oil-composite when there are SPH particles
}
```

### 3. Alcohol Settings (Surfactant Effect)
**File**: `src/simulation/layers/OilLayer.js`

Alcohol is nearly invisible - it's a physics modifier, not a visual layer:
- **Strength**: `0.15` (very subtle)
- **Dissipation**: `0.97` (fades relatively quickly)
- **Purpose**: Reduce surface tension, make oil blobs slide

### 4. Material Selection Feedback
**File**: `src/controller.js`

Added console output showing:
```
🧪 MATERIAL: Alcohol (Grid Layer)
   Key 1=Ink, 2=Mineral Oil, 3=Alcohol, 4=Syrup, 5=Glycerine
```

## New Behavior

### When painting Alcohol (key 3):
✅ **Ink stays fully visible**  
✅ **New ink can be painted**  
✅ **Alcohol applies to Grid layer** (for future physics)  
✅ **oilTexture1 is cleared** (no darkening)  
✅ **Oil-composite shader is skipped**  
🍸 **Console log**: "Alcohol active: oilTexture1 cleared to prevent ink blocking"

### When painting Mineral Oil/Syrup/Glycerine (keys 2/4/5):
✅ **SPH particles spawn**  
✅ **Oil-composite shader runs normally**  
✅ **Beautiful lens effects, refraction, iridescence**  
✅ **oilTexture1 contains SPH blob data**

## Debug Logs
You should see these in console when using Alcohol:
```
🍸 Alcohol active: oilTexture1 cleared to prevent ink blocking
⏭️  Skipping oil-composite (no SPH particles) - Alcohol won't darken ink
```

## Testing
1. Hard refresh browser (Cmd+Shift+R)
2. Paint some ink (key 1)
3. Press key 3 (Alcohol) and paint
4. **Ink should stay visible!** ✨

## Architecture Notes

### Multi-Layer System
- **SPH Layer** (Mineral Oil, Syrup, Glycerine): Particle-based blobs → sphTexture
- **Grid Layer** (Alcohol): Texture-based advection-diffusion → gridTexture  
- **Water Layer** (Ink): Direct color injection → colorTexture

### Rendering Pipeline
```
Water/Ink → colorTexture
  ↓
Volumetric shader → boundaryTexture
  ↓
Post-processing → postProcessTexture
  ↓
IF (SPH particles exist):
  Oil-composite shader → oilCompositeTexture
ELSE:
  Skip oil-composite ← CRITICAL FIX!
  ↓
Boundary overlay → screen
```

## Future: Alcohol Physics
Alcohol in Grid layer is ready for:
- Surface tension reduction (via preset: `surfaceTension: 50.0`)
- Increased coupling with water (`couplingStrength: 0.12`)
- Molecular agitation (`agitation: 0.01`)
- Making SPH blobs slide more easily

Currently it's just painted and dissipates. Future work could:
1. Sample Grid layer in SPH physics
2. Reduce cohesion where Alcohol is present
3. Increase drag/friction locally
4. Create temporary "slippery" zones
