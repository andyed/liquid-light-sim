# Project Eye Candy - Liquid Light Simulator

**Status:** Milestone 2 - Water Layer Complete ✅

A GPU-accelerated fluid simulation for VJ performance and digital art, built with WebGL2. Currently implementing single-fluid (water) dynamics as foundation for dual-fluid oil/water system.

![Circular Container](https://img.shields.io/badge/Container-Circular_Boundary-blue)
![Physics](https://img.shields.io/badge/Physics-Navier--Stokes-green)
![Performance](https://img.shields.io/badge/FPS-60-brightgreen)
![Testing](https://img.shields.io/badge/Tests-Automated-yellow)

---

## Features Implemented (Milestone 2)

### ✅ Core Physics
- **Navier-Stokes Fluid Dynamics** - Incompressible flow with pressure projection
- **Viscosity** - 20 Jacobi iterations for realistic thickness/drag
- **Advection** - Semi-Lagrangian transport of velocity and color
- **Diffusion** - Color spreading with 20 iterations
- **Circular Container** - Visible boundary with physics constraints (radius 0.48)

### ✅ User Interaction
- **Color Painting** - Left-click to inject dye (smooth blending, no oversaturation)
- **Jet Impulse** - Right-click for invisible turbulent forces (stirs existing colors)
- **Container Rotation** - Arrow keys create visible vortex (12x stronger)
- **Viscosity Control** - V key cycles presets (0.5→1.0→2.0→5.0)

### ✅ Testing Infrastructure
- **Pause/Freeze State** (PRD F004) - P key to inspect
- **State Serialization** - Ctrl+S to save state as JSON
- **Automated Tests** - Ctrl+T runs test suite
- **Performance Monitor** - Real-time FPS tracking
- **Debug Console** - `window.tester`, `window.perfMonitor` APIs

### ✅ Visual Quality
- Smooth color blending (no oversaturation)
- Visible circular glass plate boundary
- 60 FPS at 1024×1024 resolution
- Clean rendering with boundary overlay

---

## Quick Start

```bash
# Clone and run
cd liquid-light-sim
python3 -m http.server 8001

# Open browser
http://localhost:8001
```

### Controls
- **Left-click + drag** - Paint colors
- **Right-click + drag** - Create jets
- **A/D or Arrows** - Rotate container
- **V** - Cycle viscosity
- **P** - Pause/Resume
- **Ctrl+T** - Run tests

See [CONTROLS.md](CONTROLS.md) for full reference.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Strict MVC Separation                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Model (simulation.js)         View (renderer.js)            │
│  - Physics only                - Rendering only              │
│  - GPU textures                - Boundary overlay            │
│  - No rendering                - No physics                  │
│                                                               │
│  Controller (controller.js)                                  │
│  - Input handling                                            │
│  - User interactions                                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles (from v0 lessons)
1. **Testability First** - Can pause, inspect, and save state
2. **No God Objects** - Each class <500 lines, single responsibility
3. **Safe Parameter Ranges** - Documented inline with warnings
4. **Simple Solutions** - Avoid over-engineering
5. **Incremental Testing** - One change at a time

---

## Technical Details

### Physics Pipeline
```
1. Apply Forces      → Rotation, user input
2. Advect Velocity   → Self-advection
3. Apply Viscosity   → 20 Jacobi iterations
4. Pressure Solve    → 50 iterations for incompressibility
5. Advect Color      → Transport by velocity
6. Diffuse Color     → 20 iterations
```

### GPU Textures (Float32)
| Texture | Purpose | Size |
|---------|---------|------|
| `colorTexture` | RGB dye | Canvas |
| `velocityTexture` | Velocity field (RG) | Canvas |
| `pressureTexture` | Pressure scalar | Canvas |
| `divergenceTexture` | Divergence field | Canvas |

### Shaders
- `advection.frag.glsl` - Transport quantities, boundary clamping
- `forces.frag.glsl` - Apply rotation, wall reflection
- `viscosity.frag.glsl` - Momentum diffusion
- `pressure.frag.glsl` - Jacobi iteration for Poisson solve
- `gradient.frag.glsl` - Subtract pressure gradient
- `splat.frag.glsl` - Inject color/velocity
- `boundary.frag.glsl` - Circular container visualization

---

## Testing

### Browser Console API
```javascript
// Available globally
window.tester         // SimulationTester instance
window.perfMonitor    // PerformanceMonitor
window.simulation     // Direct simulation access

// Quick tests
tester.runTests()           // Full test suite
tester.analyzeVelocity()    // Check velocity stats
tester.checkForNaN()        // Detect explosion
perfMonitor.logStats()      // FPS report

// Debugging
tester.pause()              // Freeze state
const state = tester.captureState('label')
tester.saveState(state)     // Download JSON
```

### Test Runner
Open `tests/test-runner.html` for visual test interface with automated suite.

See [tests/README.md](tests/README.md) for full API.

---

## Performance

### Benchmarks
- **FPS (idle):** 60
- **FPS (active):** 55-60
- **Frame time:** 16.6ms avg
- **Resolution:** 1024×1024 (auto-detected)
- **GPU:** Requires WebGL2 + `EXT_color_buffer_float`

### Optimizations
- NEAREST texture filtering for FBOs
- Capped deltaTime for stability
- Conservative iteration counts
- Efficient ping-pong rendering

---

## Project Structure

```
liquid-light-sim/
├── index.html              # Entry point
├── style.css               # Minimal styling
├── src/
│   ├── main.js            # App initialization, testing setup
│   ├── simulation.js      # Physics model (360 lines)
│   ├── renderer.js        # View with boundary overlay
│   ├── controller.js      # Input handling
│   ├── utils.js           # Shader loader
│   └── shaders/           # GLSL shaders (11 files)
├── tests/
│   ├── test-utils.js      # Testing utilities
│   ├── test-runner.html   # Visual test interface
│   └── README.md          # Testing documentation
├── docs/
│   ├── prd.md             # Product requirements
│   ├── materials.md       # Future material system
│   └── *.md               # Research & specs
├── CONTROLS.md            # User control reference
├── CHANGELOG.md           # Version history
└── README.md              # This file
```

---

## Roadmap

### ✅ Phase 1: Foundation (Complete)
- Single-fluid water dynamics
- Testing infrastructure
- Circular container

### 🔄 Phase 2: Dual-Fluid (Next)
- [ ] Phase field advection
- [ ] Buoyancy force
- [ ] Capillary forces (surface tension)
- [ ] Oil injection controls

### ⏳ Phase 3: Polish
- [ ] Material presets
- [ ] Color palettes
- [ ] Performance profiles
- [ ] MIDI control integration

---

## Development

### Prerequisites
- Modern browser with WebGL2 support
- `EXT_color_buffer_float` extension
- Local web server (Python, Node, etc.)

### Adding Features
1. Read `docs/lessons-from-v0.md` first
2. Follow testing-first approach
3. Keep classes focused (<500 lines)
4. Document parameter ranges
5. Test incrementally

### Before Committing
```bash
# 1. Run test suite
# Open browser console, run: tester.runTests()

# 2. Check performance
perfMonitor.logStats()

# 3. Verify no NaN
tester.checkForNaN()

# 4. Update CHANGELOG.md
```

---

## Known Issues

### Current Limitations
- **Right-click jets are invisible** - They only inject velocity, so you must have colors present to see the stirring effect (this is by design to prevent accumulation)
- Water layer only (oil/water pending phase field implementation)
- No buoyancy or surface tension yet
- Rotation dissipates quickly with high viscosity

### Workarounds
- Left-click to add colors before using right-click jets
- Use V key to lower viscosity for faster rotation
- Press P to pause and inspect state

---

## References

### Documentation
- [CONTROLS.md](CONTROLS.md) - User controls
- [CHANGELOG.md](CHANGELOG.md) - Version history  
- [tests/README.md](tests/README.md) - Testing API
- [docs/prd.md](docs/prd.md) - Product requirements
- [docs/lessons-from-v0.md](docs/lessons-from-v0.md) - Architecture lessons

### Research
- [docs/Simulating 1960s Liquid Light Shows.md](docs/Simulating%201960s%20Liquid%20Light%20Shows.md)
- [docs/WebGL Liquid Light Simulation Spec.md](docs/WebGL%20Liquid%20Light%20Simulation%20Spec.md)

---

## License

See LICENSE file.

---

## Contributing

This project follows strict architectural principles learned from v0:
1. Test everything (no untestable code)
2. Keep it simple (avoid over-engineering)
3. Document safe ranges (prevent v0 mistakes)
4. Incremental changes (one feature at a time)

See contribution guidelines in `docs/lessons-from-v0.md`.

---

**Built with:** WebGL2, GLSL, JavaScript ES6  
**Inspired by:** 1960s liquid light shows, VJ culture, fluid dynamics  
**Status:** Milestone 2 Complete - Water layer functional, ready for phase field integration
