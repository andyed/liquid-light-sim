# Multi-Material Mode Guide

## What's Enabled

✅ **Multiple oil types on the same canvas simultaneously!**

Each oil blob remembers its own material properties (viscosity, coupling strength, surface tension, etc.) using the per-pixel properties texture.

## How It Works

### Per-Pixel Material Properties

When you paint oil, the system stores that material's properties in a texture at each pixel:
- **R channel**: Coupling strength
- **G channel**: Viscosity  
- **B channel**: Surface tension
- **A channel**: Oil drag strength

This means:
- **Mineral Oil blob** can have high coupling (0.5) and low viscosity (0.1)
- **Glycerine blob** can have different coupling (0.45) and higher viscosity (1.8)
- They coexist and behave independently!

### Pipeline Integration

The properties are used in:
1. **Oil coupling shader** (`oil-coupling.frag.glsl`): Reads coupling strength per-pixel
2. **Surface tension force shader** (`surface-tension-force.frag.glsl`): Reads tension per-pixel
3. **Water oil drag** (future): Will read drag per-pixel

## How to Use

### Basic Multi-Material Workflow

1. **Paint Mineral Oil**:
   - Select "Mineral Oil" from material dropdown
   - Paint some blobs
   - They'll move with high coupling

2. **Switch to Glycerine** (without clearing!):
   - Select "Glycerine"  
   - Paint different blobs
   - New blobs have Glycerine properties
   - Old Mineral Oil blobs keep their properties

3. **Switch to Alcohol**:
   - Select "Alcohol"
   - Paint more blobs
   - Now you have 3 types on canvas!

4. **Rotate and watch**:
   - Each blob behaves according to its material
   - Mineral Oil: Fast, responsive (high coupling, low viscosity)
   - Glycerine: Slower, viscous (medium coupling, higher viscosity)
   - Alcohol: Lightest (lower coupling, low viscosity)

## Material Characteristics

### Mineral Oil
- **Coupling**: 0.5 (very responsive to water)
- **Viscosity**: 0.1 (flows easily)
- **Surface Tension**: 0.000001 (weak cohesion)
- **Behavior**: Fast-moving, fluid blobs

### Alcohol  
- **Coupling**: 0.3 (moderate response)
- **Viscosity**: 0.15 (slightly thicker)
- **Surface Tension**: 0.000001 (weak cohesion)
- **Behavior**: Light, moderate motion

### Syrup
- **Coupling**: 0.4 (good response)
- **Viscosity**: 1.5 (thick, slow)
- **Surface Tension**: 0.000002 (stronger cohesion)
- **Behavior**: Thick, cohesive blobs

### Glycerine
- **Coupling**: 0.45 (very responsive)
- **Viscosity**: 1.8 (thickest)
- **Surface Tension**: 0.000002 (strong cohesion)
- **Behavior**: Dense, slow-moving blobs

## Visual Differences

Each material also has different visual properties:
- **Colors**: Different palette ranges
- **Refraction**: Different refractive indices
- **Occlusion**: Different opacity/thickness appearance
- **Alpha gamma**: Different edge softness

## Current Limitations

### ⚠️ Blending Behavior

When two different oil types **merge**:
- Properties blend based on thickness-weighted average
- This is physically approximate (real fluids don't always mix)
- You may see intermediate behaviors at boundaries

### Future Enhancements

1. **"Immiscible" mode**: Option to keep materials separated
2. **Color-coded debug view**: Show which material is where
3. **Material inspector**: Click to see properties at a point
4. **Per-material velocity fields**: True multi-phase flow

## Testing Multi-Material

### Test 1: Three-Material Dance

```javascript
// In console:
// 1. Paint Mineral Oil in center
controller.setMaterial(1); // Mineral Oil

// 2. Paint Glycerine on left
controller.setMaterial(4); // Glycerine

// 3. Paint Alcohol on right  
controller.setMaterial(2); // Alcohol

// 4. Rotate and observe different motions!
```

### Test 2: Property Inspector

```javascript
// Check properties at a point
function inspectOil(x, y) {
    const gl = simulation.gl;
    const oil = simulation.oil;
    const pixels = new Float32Array(4);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, oil.oilPropsFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                            gl.TEXTURE_2D, oil.oilPropsTexture1, 0);
    
    const px = Math.floor(x * gl.canvas.width);
    const py = Math.floor((1-y) * gl.canvas.height);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    console.log(`Properties at (${x}, ${y}):`);
    console.log(`  Coupling: ${pixels[0].toFixed(3)}`);
    console.log(`  Viscosity: ${pixels[1].toFixed(3)}`);
    console.log(`  Surface Tension: ${pixels[2].toFixed(6)}`);
    console.log(`  Drag: ${pixels[3].toFixed(3)}`);
}

// Usage: inspectOil(0.5, 0.5); // center
```

## Parameter Tuning

If a material isn't behaving well:

### Too Slow/Frozen
- **Increase** `couplingStrength` (try 0.4-0.6)
- **Decrease** `oilViscosity` (try 0.1-0.5)
- **Decrease** `oilViscosityIterations` (try 30-60)

### Too Fast/Chaotic
- **Decrease** `couplingStrength` (try 0.1-0.3)
- **Increase** `oilViscosity` (try 0.5-2.0)

### Not Cohesive Enough
- **Increase** `surfaceTension` (try 0.000002-0.00001)

### Too Blobby/Rigid
- **Decrease** `surfaceTension` (try 0.0000001-0.000001)

## Clear Canvas

If you want to start fresh:

```javascript
// Clear all oil
simulation.oil.clearOil();

// Or clear water too
simulation.water.clearColor();
```

## Implementation Notes

### Why This Works

The ping-pong properties texture (fixed today) ensures:
1. No feedback loops when painting
2. Properties persist between frames
3. Each pixel "remembers" its material
4. Shaders read local properties during simulation

### Performance

**No significant impact:**
- One 4-channel RGBA16F texture (small)
- Properties read once per pixel per shader pass
- Same number of shader invocations as single-material

## Have Fun!

Try painting different materials in patterns:
- Rings of different oils
- Checkerboard patterns
- Gradual transitions
- See how they interact!

The multi-material capability opens up much more interesting visual possibilities. 🎨
