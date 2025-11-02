# Remaining Work for v1.0

## Session Summary (Nov 2, 2025)

**What We Fixed Today:**
- ✅ WebGL feedback loop
- ✅ Oil dissipation (overflow interval)
- ✅ Oil→water coupling
- ✅ Ink overflow
- ✅ Material parameters
- ✅ Multi-material support

**Current State:**
- Oil paints and persists ✅
- Oil moves with water (weakly) ⚠️
- Oil pushes water/ink ✅
- No crashes/errors ✅
- Still has rendering artifacts ⚠️

---

## Priority 1: Surface Tension (Blobby Behavior)

**Problem**: Oil still shears into lines instead of forming round blobs

**Current Status**: 
- Shader implemented with proper physics (perimeter minimization)
- Values set very weak (0.00001-0.00004) to prevent locking
- Force multiplier reduced (50.0) to allow motion

**Next Steps**:
1. **Increase gradually and test**:
   ```javascript
   // Test with stronger values
   simulation.surfaceTension = 0.0002;  // 20x current
   ```

2. **Balance with coupling**:
   - Higher tension needs higher coupling to overcome it
   - Target: tension creates cohesion, coupling creates motion

3. **Tune per material**:
   - Mineral Oil: Medium tension (0.0001-0.0002)
   - Alcohol: Weak tension (0.00005)
   - Syrup: Strong tension (0.0005)
   - Glycerine: Strongest tension (0.0008)

4. **Adjust shader multiplier**:
   - Try 100.0, 200.0 in surface-tension-force.frag.glsl line 65
   - Test stability with each change

---

## Priority 2: Coupling Strength

**Problem**: Oil velocity is only 1-10% of water velocity (should be 30-50%)

**Current State**:
- Coupling enabled and working
- Parameters set to 0.3-0.5
- But ratio still very low

**Possible Causes**:
1. **Viscosity too high** - damping velocity too much
2. **Surface tension fighting motion** - even weak values resist
3. **Advection spreading velocity thin**
4. **Time step too small** - forces don't accumulate

**Next Steps**:
1. **Test with extreme coupling**:
   ```javascript
   simulation.couplingStrength = 2.0;  // Very high
   simulation.oilViscosity = 0.01;     // Very low
   ```

2. **Disable surface tension temporarily**:
   ```javascript
   simulation.surfaceTension = 0.0;
   ```
   If oil moves better → surface tension is the problem

3. **Check shader forces**:
   - Add console logging to coupling shader
   - Verify force magnitudes are reasonable

4. **Try direct water velocity**:
   ```javascript
   simulation.debugAdvectOilWithWaterVelocity = true;
   ```
   If this works → coupling/viscosity are the bottleneck

---

## Priority 3: Rendering Artifacts

**Problem**: Horizontal banding visible in oil (see screenshots)

**Current State**:
- Severe artifacts when oil is static
- Looks like texture sampling or numerical precision issue

**Possible Causes**:
1. **Texture format** - RGBA16F may have precision issues
2. **MacCormack advection** - though oil uses semi-Lagrangian
3. **Composite shader** - thin-film calculation
4. **Mip-mapping** - if enabled on oil textures

**Next Steps**:
1. **Try RGBA32F format**:
   ```javascript
   // In OilLayer.js init():
   this.oilTexture1 = this.sim.createTexture(w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT);
   ```

2. **Disable MacCormack**:
   ```javascript
   simulation.useMacCormack = false;
   ```

3. **Simplify composite shader**:
   - Remove thin-film calculation temporarily
   - Render oil as flat color to isolate issue

4. **Check texture filtering**:
   - Ensure LINEAR filtering, not NEAREST
   - No mipmaps on simulation textures

---

## Priority 4: Parameter Tuning

**Goal**: Each material should have distinct, appealing behavior

**Mineral Oil** (Target: Fast, fluid):
- coupling: 0.5 ✅
- viscosity: 0.1 ✅
- tension: 0.0001-0.0002 (tune)

**Alcohol** (Target: Light, tears easily):
- coupling: 0.3 ✅
- viscosity: 0.15 ✅
- tension: 0.00005-0.0001 (tune)

**Syrup** (Target: Thick, cohesive):
- coupling: 0.4 ✅
- viscosity: 1.5 ⚠️ (maybe still too high)
- tension: 0.0003-0.0006 (tune)

**Glycerine** (Target: Very thick, blobby):
- coupling: 0.45 ✅
- viscosity: 1.8 ⚠️ (maybe still too high)
- tension: 0.0004-0.0008 (tune)

---

## Priority 5: Visual Polish

From v1.0 doc:

1. **Thin-film controls**:
   - Expose thinFilmMin, thinFilmMax as UI controls
   - Add thickness gain slider
   - Allow runtime adjustment

2. **Oil velocity debug view**:
   - HSV visualization like water
   - Toggle with keyboard shortcut
   - Shows coupling and shear visually

3. **Material inspector**:
   - Click to see properties at point
   - Show which material is where
   - Color-coded overlay mode

---

## Testing Methodology

### Test 1: Coupling Ratio
```javascript
// Should show 30-50% ratio
fetch('test-coupling-live.js').then(r => r.text()).then(eval)
```

### Test 2: Persistence
```javascript
// Oil should maintain thickness
fetch('check-oil-splat.js').then(r => r.text()).then(eval)
```

### Test 3: Blobby Behavior
1. Paint Glycerine (highest tension)
2. Rotate container
3. Should form round blobs, not lines
4. Blobs should drift while maintaining shape

### Test 4: Multi-Material
1. Paint Mineral Oil
2. Switch to Glycerine, paint nearby
3. Switch to Alcohol, paint elsewhere
4. Rotate - each should behave distinctly

---

## Quick Wins (Easy Improvements)

1. **Increase coupling force multiplier**:
   - In coupling-force.frag.glsl line 40
   - Try 100.0 instead of 50.0

2. **Reduce viscosity iterations**:
   - All materials: cut iterations in half
   - Faster response, less damping

3. **Disable surface tension entirely**:
   - Get motion working first
   - Add cohesion later

4. **Add console logging**:
   - Show coupling ratio each frame
   - Alert when coupling is zero
   - Warn about parameter mismatches

---

## Known Limitations

**Physics Simplifications**:
- Single-layer oil (no thick 3D films)
- No oil-oil viscosity (different materials don't interact)
- No true immiscibility (materials blend at boundaries)
- No surfactant effects
- No temperature dependence

**Performance**:
- Limited to ~60 FPS
- Large canvas (2048x2048) may lag
- Many shader passes per frame

**Numerical**:
- Time step fixed (not adaptive)
- Pressure solve iterations limited
- Advection semi-Lagrangian (not fully accurate)

---

## Success Metrics

**v1.0 is complete when:**
- ✅ Oil paints successfully
- ⚠️ Oil forms cohesive round blobs
- ✅ Oil drifts with water rotation
- ✅ Multiple materials coexist
- ⚠️ Coupling ratio > 30%
- ✅ No crashes or WebGL errors
- ⚠️ Visually appealing (minimal artifacts)
- ✅ Stable over time (no accumulation/loss)

**Current: 5/8 achieved (63%)**

---

## Estimated Time to v1.0

- **Surface tension tuning**: 2-4 hours
- **Coupling optimization**: 1-2 hours
- **Artifact fixing**: 1-3 hours
- **Parameter polish**: 1 hour
- **Testing & docs**: 1 hour

**Total: 6-11 hours remaining**

**Recommendation**: Focus on surface tension first (biggest visual impact)
