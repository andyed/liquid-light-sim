# Changelog

## [Unreleased] - 2025-10-28

### Added - RGB Light Projection System
- **Automated color wheel** - RGB light rotation for liquid light show aesthetics
- **C key control** - Cycle through rotation speeds (OFF → 0.5 → 1.0 → 2.0 → 5.0°/frame)
- **Visual indicator** - Glowing circle in bottom-right shows current light color
- **Volumetric rendering** - Beer-Lambert absorption shader (disabled by default)
- **X key** - Clear canvas for testing color changes
- Foundation for oil phase lighting (refraction, caustics)

## [Previous] - 2025-10-28

### Changed - Proper Passive Scalar Physics Model
- **BREAKING:** Replaced discrete splat system with continuous source injection
- Implemented proper advection-diffusion equation for color transport (∂φ/∂t = source + u·∇φ + D∇²φ)
- Color now properly advects with velocity field (swirls, rotates, responds to jets)
- Realistic molecular diffusion rates (D ≈ 10⁻¹⁰ to 10⁻⁸ m²/s)
- Gaussian source injection with saturation cap (prevents white oversaturation)
- Removed concentration pressure (non-physical, unstable)

### Added - Milestone 2 Water Layer Complete
- ✅ **Viscosity simulation** - Fluid thickness and drag (20 Jacobi iterations)
- ✅ **Circular container boundary** - Visible glass plate with physics constraints
- ✅ **Jet impulse tool** - Right-click for strong turbulent forces
- ✅ **Container rotation** - Arrow keys create visible vortex (12x stronger)
- ✅ **Testing infrastructure** - Pause/freeze, state inspection, automated tests
- ✅ **Performance monitoring** - Real-time FPS tracking

### Fixed
- Fixed rotation force calculation (tangential vortex instead of rotation matrix)
- Fixed splat oversaturation (mix instead of add, 50% intensity)
- Fixed jet leaving color trails (separate velocity-only function)
- Fixed framebuffer errors (enabled EXT_color_buffer_float extension)

### Technical Improvements
- Clean simulation architecture (360 lines, no duplicates)
- Strict Model-View separation
- Comprehensive testing tools (SimulationTester, PerformanceMonitor)
- PRD F004 compliance (pause/freeze state for debugging)
- Boundary physics in 3 shaders (forces, advection, visualization)

### Performance
- Maintains 60 FPS at 1024×1024 resolution
- 50 pressure iterations for incompressibility
- 20 viscosity iterations for realistic drag
- Optimized texture formats (NEAREST filtering for FBOs)

### Known Limitations
- Water layer only (oil/water phase field not yet implemented)
- No buoyancy force (pending phase field)
- No surface tension (pending capillary forces)
- **Right-click jet is invisible** - must have colors present to see stirring effect

### Controls
- **Left-click + drag** - Paint color
- **Right-click + drag** - Jet impulse (stirs existing colors)
- **A/D or Arrow Keys** - Rotate container
- **V** - Cycle viscosity (0.5 → 1.0 → 2.0 → 5.0)
- **P** - Pause/Resume
- **Ctrl+T** - Run tests
- **Ctrl+S** - Save state

### Testing
- Browser console: `window.tester`, `window.perfMonitor`, `window.simulation`
- Test runner UI: `tests/test-runner.html`
- Automated physics validation
- State serialization for regression tests

---

## Next Steps (Milestone 2 Completion)
- [ ] Phase field advection (oil/water interface)
- [ ] Buoyancy force integration
- [ ] Capillary forces (surface tension)
- [ ] Oil injection controls
