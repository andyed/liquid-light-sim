# Next Session Plan

November 14, 2025
heavier (denser) oil splats should push water more than lighter oil.
Picking a simple mass proxy (SPH density or neighbor count).
Scaling the existing oil→water coupling strength with that proxy when splatting to the grid.

**Date**: November 9, 2025  
**Status**: MULTI-LAYER ARCHITECTURE COMPLETE! 

---

## Current State

### Multi-Layer System Working
- **SPH Layer**: Mineral Oil, Syrup, Glycerine (particle-based)
- **Grid Layer**: Alcohol (texture-based advection-diffusion)
- **Composite Layer**: Automatic blending (SPH over Grid)
- **Independent Physics**: Each layer runs its own simulation
- **Proper Rendering**: Materials can coexist without interference

### ✅ Bug Fixes Complete
2. ✅ Material switching doesn't create spurious motion
3. ✅ Alcohol is translucent (allows ink to show through)
4. ✅ Grid layer only updates when it has content

---

## 🎯 Next Priorities

### 1. Performance Optimization
- Profile composite shader (currently ~1ms)
- Consider texture size optimization
- Add framerate monitoring

### 2. Enhanced Multi-Material Features
- **Interaction Physics**: SPH particles displace grid fluid
- **Material Mixing**: Alcohol dilutes/spreads SPH materials
- **Visual Effects**: Color bleeding between layers

### 3. UX Improvements
- Visual indicator for which layer is active
- Layer visibility toggles (show/hide SPH vs Grid)
- Clear individual layers (not just all)

### 4. SPH Tuning (Ongoing)
- Continue rotation force balance
- MetaBall parameter optimization
- Particle lifecycle refinement

---

## 📚 Previous State (Archive - Nov 9, 2025)

 BREAKTHROUGH: SPH Blobs Are Rendering!

After fixing critical bugs, SPH particles are now:
- Rendering with correct colors
- Forming cohesive blob shapes
- Persisting without fade-out
- Using pre-multiplied alpha for proper color mixing
- Cleaning up out-of-bounds particles
- ✅ Persisting without fade-out
- ✅ Using pre-multiplied alpha for proper color mixing
- ✅ Cleaning up out-of-bounds particles

### Key Fixes Applied:
1. **Material Name Lookup Bug** - Fixed `window.controller` access
2. **Color Preservation** - Removed temperature encoding from blue channel
3. **Blending Model** - Changed from additive to pre-multiplied alpha
4. **Overflow System** - Disabled for SPH (was destroying blobs)
5. **Particle Cleanup** - Added `removeOutOfBoundsParticles()`
6. **Force Balance** - Cohesion k=20,000, Pressure B=2, Drag=3

## Remaining Issues

1.  **Rotation Broken** - Water stops rotating after mineral oil is painted
2.  **Particle Trails** - Need better lifecycle management (partially fixed)
3.  **Blob Spheroidization** - Not fully round yet (needs more time/tuning)

## Next Session Priority: Rotation & Blob Physics Tuning

### 1. Fix Rotation Integration (CRITICAL)
**Problem**: Water layer stops rotating after SPH particles are spawned.
-   **Investigate**: Check if early return in OilLayer is preventing water updates
-   **Action**: Debug rotation force propagation through the update pipeline
-   **Test**: Ensure water + SPH particles both rotate together
-   **Tune**: Balance drag coefficient (currently 3.0) and rotation force (500.0)

### 2. Refine Force Balance
**Goal**: Blobs should be round, cohesive, and respond to rotation without tearing.

Current settings:
```javascript
// ImplicitSolver.js
k = 20000.0;           // Cohesion (VERY HIGH)

// SPHOilSystem.js
B = 2.0;               // Pressure (MINIMAL)
gravityMag = 0.001;    // Gravity (MINIMAL)
dragCoeff = 3.0;       // Water coupling (MODERATE)
rotationForce = 500.0; // Rotation (STRONG)
```

**Tuning Tasks**:
- [ ] Increase rotation force if blobs don't swirl (currently 500)
- [ ] Reduce cohesion if blobs are too rigid (currently 20000)
- [ ] Adjust drag if blobs tear during rotation (currently 3.0)
- [ ] Lower gravity more if blobs sink too fast (currently 0.001)

### 3. Improve Spheroidization
**Goal**: Blobs should become spherical within 2-5 seconds.

**Experiment with**:
- Cooling rate (currently 0.001) - slower = more time to spheroidize
- MetaBall radius (currently 25.0) - affects smoothness
- MetaBall threshold (currently 0.4) - affects visible size

### 4. Optimize Particle Management
**Current**: `removeOutOfBoundsParticles()` cleans up escapees.

**Additional cleanup needed**:
- [ ] Age-based removal (old particles fade/disappear)
- [ ] Density-based merging (sparse regions consolidate)
- [ ] Smart spawning (don't spawn if at limit, remove oldest first)

### 5. Performance Monitoring
With 50 particles/splat, monitor:
- Frame rate with 500 particles: Should be 60fps
- Frame rate with 2000 particles: Target 30fps+
- Frame rate with 5000 particles: Acceptably >15fps

If too slow:
- Reduce smoothing radius (less neighbor checks)
- Increase frame skip threshold (currently >3000)
- Consider spatial hash optimization