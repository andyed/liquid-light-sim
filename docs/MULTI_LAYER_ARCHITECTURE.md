# Multi-Layer Architecture Plan

**Date**: November 9, 2025  
**Goal**: Enable simultaneous SPH (Mineral Oil, Syrup) + Grid (Alcohol) rendering  
**Status**: PLANNING PHASE

---

## 🎯 Requirements

### Must Support:
1. **Paint Mineral Oil** → SPH particles with physics
2. **Paint Alcohol** → Grid-based texture fluid
3. **Both visible simultaneously** → Composited rendering
4. **Independent physics** → SPH doesn't affect grid, grid doesn't affect SPH
5. **Visual blending** → Proper color mixing in final output

---

## 🏗️ Architecture Design

### Current (Single Layer):
```
OilLayer:
  - oilTexture1/2 (shared by SPH and grid)
  - sph.renderParticles() → oilTexture
  - OR grid advection → oilTexture
  - Problem: Can't do both!
```

### Proposed (Dual Layer):
```
OilLayer:
  - sphTexture1/2 (SPH particles only)
  - gridTexture1/2 (Alcohol/grid-based only)
  - compositedTexture (final blend)
  
Render Pipeline:
  1. SPH path → sphTexture
  2. Grid path → gridTexture  
  3. Composite shader → compositedTexture
  4. Final render uses compositedTexture
```

---

## 📐 Layer System

### Layer 1: SPH Particles
**Materials**: Mineral Oil, Syrup, Glycerine

**Textures**:
```javascript
this.sphTexture1 = createRGBATexture(gl, width, height);
this.sphTexture2 = createRGBATexture(gl, width, height);
this.sphFBO = createFramebuffer(gl);
```

**Rendering**:
```javascript
// Clear SPH layer
gl.bindFramebuffer(gl.FRAMEBUFFER, this.sphFBO);
gl.framebufferTexture2D(..., this.sphTexture2, ...);
gl.clear(gl.COLOR_BUFFER_BIT);

// Render particles
this.sph.renderParticles(this.sphFBO, width, height);

// Apply MetaBall
if (metaballEnabled) {
  applyMetaBall(this.sphTexture1 → this.sphTexture2);
}
```

**Physics**: Full SPH update (pressure, cohesion, rotation, etc.)

---

### Layer 2: Grid-Based Fluid
**Materials**: Alcohol, (Ink uses water layer)

**Textures**:
```javascript
this.gridTexture1 = createRGBATexture(gl, width, height);
this.gridTexture2 = createRGBATexture(gl, width, height);
this.gridVelocityTexture1 = createRGTexture(gl, width, height);
this.gridVelocityTexture2 = createRGTexture(gl, width, height);
this.gridFBO = createFramebuffer(gl);
```

**Rendering**:
```javascript
// Apply coupling from water
applyCoupling(gridTexture, waterVelocity);

// Advect velocity
advectVelocity(gridVelocityTexture);

// Advect color
advectColor(gridTexture, gridVelocityTexture);

// Apply diffusion (optional)
if (material === 'Alcohol') {
  applyDiffusion(gridTexture);
}
```

**Physics**: Standard grid-based advection-diffusion

---

### Layer 3: Composite
**Purpose**: Blend SPH + Grid layers for final output

**Textures**:
```javascript
this.compositedTexture = createRGBATexture(gl, width, height);
this.compositeFBO = createFramebuffer(gl);
```

**Shader** (`oil-composite.frag.glsl`):
```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_sphTexture;   // SPH layer
uniform sampler2D u_gridTexture;  // Grid layer
uniform vec2 u_resolution;

void main() {
  vec4 sph = texture(u_sphTexture, v_texCoord);
  vec4 grid = texture(u_gridTexture, v_texCoord);
  
  // Pre-multiplied alpha compositing (over operator)
  // Result = Src + Dst * (1 - Src.a)
  
  // Put SPH on top of grid (SPH is foreground)
  vec3 composite_rgb = sph.rgb + grid.rgb * (1.0 - sph.a);
  float composite_a = sph.a + grid.a * (1.0 - sph.a);
  
  fragColor = vec4(composite_rgb, composite_a);
}
```

**Rendering**:
```javascript
gl.useProgram(compositeProgram);
gl.bindFramebuffer(gl.FRAMEBUFFER, this.compositeFBO);

// Bind both layers
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, this.sphTexture1);
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, this.gridTexture1);

// Composite
gl.drawArrays(gl.TRIANGLES, 0, 6);
```

---

## 🔄 Update Flow

### Frame Update:
```javascript
update(dt) {
  const currentMaterial = getCurrentMaterial();
  const isSPH = ['Mineral Oil', 'Syrup', 'Glycerine'].includes(currentMaterial);
  const isGrid = ['Alcohol'].includes(currentMaterial);
  
  // 1. Update SPH layer (if particles exist OR painting SPH)
  if (this.sph.particleCount > 0 || isSPH) {
    this.updateSPHLayer(dt);
  }
  
  // 2. Update Grid layer (if painting grid material)
  if (isGrid) {
    this.updateGridLayer(dt);
  }
  
  // 3. Composite both layers
  this.compositeOilLayers();
  
  // 4. Final render uses compositedTexture
}
```

### SPH Layer Update:
```javascript
updateSPHLayer(dt) {
  // Physics (only if painting SPH)
  if (isSPH && this.sph.particleCount > 0) {
    this.sph.update(dt, rotationAmount, gridVelocities);
  }
  
  // Rendering (always if particles exist)
  if (this.sph.particleCount > 0) {
    this.renderSPHToTexture();
    if (metaballEnabled) {
      this.applyMetaBall();
    }
  } else {
    // Clear SPH texture if no particles
    this.clearTexture(this.sphTexture2);
  }
}
```

### Grid Layer Update:
```javascript
updateGridLayer(dt) {
  // Standard grid-based pipeline
  this.applyCoupling(dt);
  this.advectVelocity(dt);
  this.advectColor(dt);
  
  if (currentMaterial === 'Alcohol') {
    this.applyDiffusion(dt);
  }
}
```

---

## 🎨 Rendering Pipeline

### Final Render Order:
```
1. Water layer (background)
   ↓
2. Composited oil layer (SPH + Grid blended)
   ↓
3. Final compositing with refraction, occlusion, etc.
```

### Texture Access:
```javascript
// In final shader (display.frag.glsl or similar):
uniform sampler2D u_waterTexture;
uniform sampler2D u_oilTexture;  // ← Now the composited result!

// Water is background
vec3 waterColor = texture(u_waterTexture, uv).rgb;

// Oil is foreground (already composited SPH + Grid)
vec4 oil = texture(u_oilTexture, uv);

// Blend with water
vec3 final = waterColor * (1.0 - oil.a) + oil.rgb;
```

---

## 📦 Data Structures

### OilLayer Class Updates:

```javascript
class OilLayer extends FluidLayer {
  constructor(gl, simulation) {
    super(simulation);
    this.gl = gl;
    
    // === SPH LAYER ===
    this.sph = new SPHOilSystem(5000, 0.48);
    this.sphTexture1 = null;
    this.sphTexture2 = null;
    this.sphFBO = null;
    
    // === GRID LAYER ===
    this.gridTexture1 = null;
    this.gridTexture2 = null;
    this.gridVelocityTexture1 = null;
    this.gridVelocityTexture2 = null;
    this.gridFBO = null;
    this.gridVelocityFBO = null;
    
    // === COMPOSITE LAYER ===
    this.compositedTexture = null;
    this.compositeFBO = null;
    
    // === LEGACY (DEPRECATED) ===
    // Remove: this.oilTexture1/2, this.oilFBO
  }
  
  init(gl) {
    const width = gl.canvas.width;
    const height = gl.canvas.height;
    
    // Initialize SPH layer
    this.sphTexture1 = this.createTexture(gl, width, height);
    this.sphTexture2 = this.createTexture(gl, width, height);
    this.sphFBO = gl.createFramebuffer();
    
    // Initialize Grid layer
    this.gridTexture1 = this.createTexture(gl, width, height);
    this.gridTexture2 = this.createTexture(gl, width, height);
    this.gridVelocityTexture1 = this.createVelocityTexture(gl, width, height);
    this.gridVelocityTexture2 = this.createVelocityTexture(gl, width, height);
    this.gridFBO = gl.createFramebuffer();
    this.gridVelocityFBO = gl.createFramebuffer();
    
    // Initialize Composite layer
    this.compositedTexture = this.createTexture(gl, width, height);
    this.compositeFBO = gl.createFramebuffer();
    
    // SPH GPU resources
    this.sph.initGPUResources(gl);
  }
  
  // Swap helpers
  swapSPHTextures() {
    [this.sphTexture1, this.sphTexture2] = [this.sphTexture2, this.sphTexture1];
  }
  
  swapGridTextures() {
    [this.gridTexture1, this.gridTexture2] = [this.gridTexture2, this.gridTexture1];
  }
  
  // Public API: Get final oil texture for rendering
  getOilTexture() {
    return this.compositedTexture;
  }
}
```

---

## 🖌️ Painting (splatColor)

### Current Material Routing:

```javascript
splatColor(x, y, color, radius) {
  const currentMaterial = getCurrentMaterial();
  
  if (['Mineral Oil', 'Syrup', 'Glycerine'].includes(currentMaterial)) {
    // Paint SPH particles
    const worldX = (x - 0.5) * 2 * this.sph.containerRadius;
    const worldY = (0.5 - y) * 2 * this.sph.containerRadius;
    this.sph.spawnParticles(worldX, worldY, 50, color, 20.0);
    
  } else if (currentMaterial === 'Alcohol') {
    // Paint grid-based oil
    this.splatToGridLayer(x, y, color, radius);
  }
  // Ink uses water layer, not oil layer
}
```

### Grid Splat Implementation:

```javascript
splatToGridLayer(x, y, color, radius) {
  const gl = this.gl;
  const sim = this.sim;
  
  gl.useProgram(sim.splatProgram);
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridFBO);
  gl.framebufferTexture2D(..., this.gridTexture2, ...);
  
  // Standard splat shader with u_isOil = true
  gl.uniform3f(gl.getUniformLocation(sim.splatProgram, 'u_color'), color.r, color.g, color.b);
  gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_point'), x, y);
  gl.uniform1f(gl.getUniformLocation(sim.splatProgram, 'u_radius'), radius);
  gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_isOil'), 1);
  
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  this.swapGridTextures();
}
```

---

## 🔧 Implementation Steps

### Phase 1: Infrastructure (1-2 hours)
- [ ] Add sphTexture1/2, gridTexture1/2, compositedTexture
- [ ] Create composite shader (oil-composite.frag.glsl)
- [ ] Update OilLayer.init() to create all textures
- [ ] Add compositeOilLayers() method

### Phase 2: Split Update Path (1 hour)
- [ ] Separate updateSPHLayer() method
- [ ] Separate updateGridLayer() method
- [ ] Route based on material type + existence
- [ ] Call compositeOilLayers() at end

### Phase 3: Update References (30 min)
- [ ] Change all `oilTexture1` → depends on context
- [ ] Update final renderer to use `getOilTexture()`
- [ ] Update splatColor to route correctly

### Phase 4: Testing (30 min)
- [ ] Test SPH only (Mineral Oil)
- [ ] Test Grid only (Alcohol)
- [ ] Test Mixed (Mineral Oil + Alcohol simultaneously)
- [ ] Test material switching
- [ ] Test clear canvas

### Phase 5: Cleanup (30 min)
- [ ] Remove old oilTexture1/2 references
- [ ] Update documentation
- [ ] Performance profiling

**Total Estimated Time**: 3-4 hours

---

## 🎯 Success Criteria

### Functional:
- [ ] Paint Mineral Oil → See SPH blobs
- [ ] Paint Alcohol → See grid fluid
- [ ] Paint both → See both simultaneously
- [ ] SPH physics independent from grid
- [ ] Grid physics independent from SPH
- [ ] Proper visual blending (no white artifacts)

### Visual Quality:
- [ ] No flickering or z-fighting
- [ ] Smooth alpha blending
- [ ] Colors mix correctly
- [ ] MetaBall works on SPH layer
- [ ] Diffusion works on grid layer

### Performance:
- [ ] No significant FPS drop (target: <10% overhead)
- [ ] Memory usage acceptable (<50MB extra)
- [ ] Composite shader fast (<1ms)

---

## ⚠️ Potential Issues

### Issue 1: Texture Memory
**Problem**: 4 extra textures = 4 × (1024² × 4 bytes) ≈ 16MB  
**Solution**: Acceptable for modern GPUs

### Issue 2: Composite Artifacts
**Problem**: Blending order matters (SPH over grid vs grid over SPH)  
**Solution**: Test both orders, choose best visual result

### Issue 3: Performance
**Problem**: Extra composite pass + texture reads  
**Solution**: Profile, optimize shader, consider caching

### Issue 4: Interaction Physics
**Problem**: SPH particles can't "see" grid fluid  
**Solution**: Phase 4 enhancement - add collision detection

---

## 🚀 Future Enhancements (Phase 4+)

### SPH ↔ Grid Interaction:
- SPH particles displace grid fluid
- Grid velocity affects SPH particles (already implemented)
- Collision detection for mixing

### Per-Material Properties:
- Store material ID per pixel
- Different viscosity/diffusion per material
- Enable "Alcohol dilutes Mineral Oil" effects

### Layer Count Scaling:
- Support N layers (arbitrary materials)
- Dynamic layer allocation
- Layer priority/Z-order

---

## 📊 Comparison

### Before (Single Layer):
```
Materials: SPH OR Grid (not both)
Textures: 2 (oilTexture1/2)
Memory: ~8MB
Complexity: Simple
Limitation: Can't mix
```

### After (Dual Layer):
```
Materials: SPH AND Grid simultaneously
Textures: 6 (sph×2 + grid×2 + composite×1 + gridVel×1)
Memory: ~24MB
Complexity: Medium
Capability: Full multi-material
```

---

## ✅ Next Steps

1. **Review this plan** with user
2. **Start Phase 1** (infrastructure)
3. **Test incrementally** after each phase
4. **Document changes** as we go
5. **Celebrate** when mixing works! 🎉

---

**Status**: READY TO IMPLEMENT  
**Priority**: HIGH (required for simulation)  
**Risk**: LOW (clean architecture, clear steps)

Let's build this! 🚀
