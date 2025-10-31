# Boundary Modes - Technical Documentation

## Overview

The simulation now supports three different boundary interaction modes to address the issue of ink behavior near the circular container walls. Press **B** to cycle between modes, or use the hamburger menu.

## The Problem

The original bounce implementation simply reflected velocity at the boundary, but this didn't accurately model the increased resistance caused by ink being squeezed between the moving ink and the wall. This led to unrealistic collisions and accumulation at the edges.

## The Solutions

### Mode 0: Bounce (Original)
**Physics:** Elastic reflection at the boundary

**Implementation:**
- Cancels inward normal velocity component in a thin rim band (4% of radius)
- Elasticity coefficient `k = 0.95` (95% elastic)
- Applied as smooth blend using `smoothstep` to avoid hard conditionals

**Best for:** Simple, predictable behavior; good for testing

**Characteristics:**
- Clean reflections
- Minimal energy loss
- Can still have some accumulation issues

### Mode 1: Viscous Drag (Squeeze Film Effect) ⭐ **DEFAULT**
**Physics:** Models the increased resistance from ink trapped between moving ink and the wall

**Implementation:**
- **Squeeze film effect:** Drag coefficient increases quadratically near wall (max 85% damping)
- **Tangential damping:** Friction from wall slows down tangential velocity (60% max)
- **Radial resistance:** Strongly resists outward motion (120% damping)
- **Gentle bounce:** Soft reflection for strong inward motion (70% strength)
- Active in wider band (8% of radius) for smoother transition

**Best for:** Realistic fluid behavior; prevents harsh collisions

**Characteristics:**
- Smooth deceleration near walls
- Natural-looking flow patterns
- Prevents ink from "slamming" into boundaries
- More physically accurate for viscous fluids

**Physics Justification:**
When ink moves toward a wall, it must push through the layer of ink already near the wall. This creates a "squeeze film" effect where the resistance increases dramatically as the gap narrows. The tangential component also experiences increased friction from the nearby wall.

### Mode 2: Repulsive Force (Soft Potential Wall)
**Physics:** Exponentially increasing force that pushes ink away before collision

**Implementation:**
- Cubic falloff: `repulsionStrength = band³ × 0.008`
- Active in large band (12% of radius) for early intervention
- Pushes inward (against the normal)
- Still includes gentle bounce (80% strength) for safety

**Best for:** Preventing any wall contact; artistic control

**Characteristics:**
- Ink never quite reaches the wall
- Creates a "cushion" effect
- Smooth, flowing behavior
- Can feel slightly artificial but very stable

## Technical Details

### Shader Implementation (`forces.frag.glsl`)

All three modes share the same coordinate system and normal calculation:

```glsl
// Compute normal for boundary interactions
vec2 normal_as = dist > 0.001 ? centered_aspect / dist : vec2(1.0, 0.0);
vec2 normal = normalize(vec2(normal_as.x / max(aspect, 1e-6), normal_as.y));
```

The mode is selected via uniform `u_boundary_mode` (0, 1, or 2).

### Key Parameters

**Mode 1 (Viscous Drag):**
- `rimBand`: `smoothstep(0.40, 0.48, dist)` - activation zone
- `dragCoeff`: `rimBand² × 0.85` - quadratic increase
- Tangential damp: `0.6` - friction coefficient
- Radial resist: `1.2` - squeeze film pressure
- Bounce strength: `0.7` - soft reflection

**Mode 2 (Repulsive Force):**
- `repulsionBand`: `smoothstep(0.36, 0.48, dist)` - early activation
- `repulsionStrength`: `band³ × 0.008` - cubic falloff
- Bounce strength: `0.8` - backup reflection

### Performance

All three modes have similar performance characteristics:
- Same number of texture reads
- Minimal branching (single if/else chain)
- No additional passes required

## Usage Recommendations

1. **Start with Mode 1 (Viscous Drag)** - It's the default and provides the most physically accurate behavior for liquid light shows.

2. **Use Mode 0 (Bounce)** when:
   - You want crisp, energetic reflections
   - Testing or debugging physics
   - Simulating less viscous fluids

3. **Use Mode 2 (Repulsive Force)** when:
   - You want maximum stability
   - Creating artistic effects
   - Preventing any edge artifacts

## Tuning

If you want to adjust the behavior, edit `forces.frag.glsl`:

**Make viscous drag stronger:**
- Increase `dragCoeff` max (currently 0.85)
- Widen the `rimBand` range (currently 0.08)
- Increase tangential/radial multipliers

**Make repulsion stronger:**
- Increase `repulsionStrength` multiplier (currently 0.008)
- Widen the `repulsionBand` range (currently 0.12)
- Change cubic to quartic falloff

**Adjust bounce:**
- Change elasticity `k` (currently 0.95 for mode 0)
- Adjust bounce strength (0.7 for mode 1, 0.8 for mode 2)

## Future Improvements

Potential enhancements:
- Velocity-dependent drag (faster ink = more resistance)
- Concentration-dependent behavior (more ink = more resistance)
- Adaptive mode switching based on local conditions
- Per-color boundary properties (different inks behave differently)

---

**Implementation Date:** October 30, 2025  
**Related Files:** `forces.frag.glsl`, `simulation.js`, `controller.js`
