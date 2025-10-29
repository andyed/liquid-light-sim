# Liquid Light Simulator - Controls

**Status:** Milestone 2 - Water Layer Complete ✅

## Mouse Controls

### Left Click + Drag
**Color Injection Tool** 🎨
- Injects your selected color into the fluid
- Color flows with velocity field
- Gentle stirring motion
- Blends smoothly (no oversaturation)

### Right Click + Drag  
**Jet Impulse Tool** 🌊
- Creates strong turbulent vortices
- **Purely invisible** - injects velocity only, no color
- Stirs and mixes existing colors turbulently
- Must have colors already present to see effect
- Best workflow: Left-click to add colors → Right-click to stir them

## Keyboard Controls

### Container Rotation 🔄
- **Arrow Left** or **A** - Rotate fluid counter-clockwise
- **Arrow Right** or **D** - Rotate fluid clockwise
- **Arrow Up/Down** - Alternative rotation controls
- Release to stop rotation
- **Note:** 12x stronger than before - very visible!

### Viscosity Control 💧
- **V** - Cycle viscosity presets
  - 0.1 (Very watery - responsive jets)
  - 0.5 (Watery - fast, energetic)
  - 1.0 (Standard - balanced)
  - 2.0 (Thick - slow swirls)

### Diffusion Control 🌊
- **D** - Cycle molecular diffusion rate
  - 0.0001 (Realistic - very slow molecular spreading)
  - 0.001 (Faster - visible spreading)
  - 0.01 (Fast - rapid mixing)
  - Note: Real ink has D ≈ 10⁻¹⁰ to 10⁻⁸ m²/s

### Turbulence Control 🌀
- **T** - Cycle vorticity confinement strength
  - 0.0 (Off - smooth laminar flow)
  - 0.1 (Subtle - gentle turbulence)
  - 0.3 (Moderate - natural small-scale eddies)
  - 0.5 (Strong - active turbulence) ⭐ Default
  - 1.0 (Very strong - chaotic motion)

### Colored Light Projection 💡
- **C** - Cycle RGB light rotation speed
  - OFF: Black background (no light) ⭐ Default
  - 0.5°/frame: Slow, smooth color transitions
  - 1.0°/frame: Moderate speed
  - 2.0°/frame: Fast rotation
  - 5.0°/frame: Very fast, dynamic
  - Visual indicator in bottom-right corner shows current light color
  - Click indicator to cycle speeds
- **L** - Toggle volumetric rendering (Beer-Lambert absorption)
  - ON: Realistic light absorption through ink ⭐ Default
  - OFF: Simple flat color display
- **K** - Cycle absorption coefficient
  - 0.5 (Subtle - light, translucent)
  - 1.0 (Moderate - balanced)
  - 2.0 (Strong - rich, saturated)
  - 3.0 (Very strong - deep, dark) ⭐ Default
  - 4.0 (Extreme - almost opaque)

### Testing & Debugging 🧪
- **P** - Pause/Resume simulation
- **M** - Toggle velocity visualization (see invisible forces!)
- **Ctrl+Q** - Run quality tests (measure straightness %)
- **Ctrl+T** - Run automated test suite
- **Ctrl+S** - Save current state to file

### Alternative Controls
- **Space + Left-click** - Alternative paint mode

## UI Controls

### Color Wheel (Top-Left)
- One-click hue selection (conic wheel)
- Affects paint color and background light tint

### Rotation Button (Bottom-Left)
- Tap to toggle container rotation on/off

### Hamburger Menu (Top-Right)
- Touch-first slide-out panel with toggles and actions:
  - Volumetric (L), Organic Flow (O), Paused (P)
  - Viscosity cycle (V) with live value
  - Clear Canvas, Run Quality Tests
  - GitHub link

### Jets (Right-Click)
- Curl-preserving ring burst, repeats while held (≈250ms cadence)
- Auto-stops after ~2 seconds per click to preserve stability

---

## Physics Parameters (For Developers)

### Current Settings
```javascript
viscosity: 0.5          // Safe: 0.5-2.0, Max: 10.0
diffusionRate: 0.1      // Color spreading rate
viscosityIterations: 20 // Jacobi iterations
pressureIterations: 50  // Incompressibility accuracy
diffusionIterations: 20 // Color diffusion quality
```

### How to Modify
Edit `src/simulation.js` constructor:
```javascript
this.viscosity = 0.5;  // Change default here
```

Or use V key to cycle through presets during runtime.

---

## Expected Behavior

### Water Layer (Current - Milestone 2)
✅ Colors flow smoothly with velocity  
✅ Viscosity adds realistic drag  
✅ Pressure keeps fluid incompressible  
✅ Rotation creates coherent vortices  
✅ Jets create turbulent chaos  
✅ **Circular boundary visible** - Gray glass plate edge  
✅ **Fluid stays inside container** - Physics constraints active  

### Not Yet Implemented (Next Phase)
❌ Oil/water separation  
❌ Blobs rising (buoyancy)  
❌ Surface tension effects  
❌ Phase field advection  

---

## Performance Tips

- **FPS drops?** Reduce iterations in simulation.js
- **Too slow?** Lower viscosity (V key)
- **Too chaotic?** Raise viscosity (V key)
- **Colors too blurred?** Lower diffusionRate

---

## Troubleshooting

### "Nothing happens when I click"
- Check browser console for errors
- Make sure canvas has focus (click on it first)
- Verify WebGL2 is supported in your browser

### "Colors don't move"
- Right-click to inject strong velocity
- Use arrow keys to create rotation
- Check that viscosity isn't too high (press V)

### "Performance is bad"
- Open browser console
- Check FPS counter (if implemented)
- Reduce window size
- Check GPU usage in Activity Monitor

---

## Painting & Color

- **Left-click + Drag** - Paint with current color
- **C** - Cycle through color palette
  - Red → Orange → Yellow → Green → Cyan → Blue → Purple → Magenta → White
- **X** - Clear all ink (fresh canvas)
- **Color Picker** - Select custom color (top-left UI, if available)

---

## Quick Test Sequence

1. **Open browser console** - See testing tools available
2. **Left-click drag** - Paint some colors first
3. **Hold A key** - Watch vortex form (very visible!)
4. **Right-click drag** - Stir colors with jets
5. **V key** - Cycle to viscosity 5.0 (thick)
6. **Hold A key again** - Notice slower, thicker rotation
7. **P key** - Pause and inspect
8. **Ctrl+T** - Run automated tests
9. **Look at edges** - See gray circular boundary

### Verify Container Works
- Paint near the circular edge
- Colors should stay inside
- Rotation should be contained
- Gray boundary should be visible

---

**Version:** Milestone 2 - Water Layer  
**Last Updated:** October 28, 2025
