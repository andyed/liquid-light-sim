export default class Controller {
    constructor(simulation) {
        this.simulation = simulation;
        this.renderer = simulation.renderer;
        this.gl = simulation.gl;

        this.isMouseDown = false;
        this.isRightMouseDown = false;
        this.isSpacePressed = false;
        this.currentColor = { r: 0.3, g: 0.898, b: 1.0 };  // Default: cyan (#4de5ff)
        
        // Track mouse position for velocity calculation
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.mouseVelocityX = 0;
        this.mouseVelocityY = 0;
        
        // Current mouse position for continuous injection
        this.currentMouseX = 0;
        this.currentMouseY = 0;

        const canvas = this.gl.canvas;
        
        // Mouse events
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());  // Disable context menu
        
        // Mouse up on window (in case mouse leaves canvas)
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // Touch events (mobile/tablet support)
        canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        const colorPicker = document.getElementById('color-picker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => this.onColorChange(e));
        }
    }

    onMouseDown(e) {
        const rect = this.gl.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1.0 - (e.clientY - rect.top) / rect.height;
        
        // Initialize position
        this.currentMouseX = x;
        this.currentMouseY = y;
        this.lastMouseX = x;
        this.lastMouseY = y;
        
        if (e.button === 0) {
            // Left click - normal color injection
            this.isMouseDown = true;
        } else if (e.button === 2) {
            // Right click - jet impulse tool
            this.isRightMouseDown = true;
        }
    }

    onMouseUp(e) {
        if (e.button === 0) {
            this.isMouseDown = false;
        } else if (e.button === 2) {
            this.isRightMouseDown = false;
        }
    }

    onMouseMove(e) {
        const rect = this.gl.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1.0 - (e.clientY - rect.top) / rect.height;
        
        // Update current mouse position
        this.currentMouseX = x;
        this.currentMouseY = y;
        
        // Calculate mouse velocity (for jet direction)
        const dx = x - this.lastMouseX;
        const dy = y - this.lastMouseY;
        this.mouseVelocityX = dx;
        this.mouseVelocityY = dy;
        this.lastMouseX = x;
        this.lastMouseY = y;
    }
    
    /**
     * Called every frame to inject continuously while mouse is held
     */
    update() {
        const x = this.currentMouseX;
        const y = this.currentMouseY;
        const dx = this.mouseVelocityX;
        const dy = this.mouseVelocityY;

        if (this.isMouseDown || (this.isSpacePressed && this.isRightMouseDown)) {
            // Continuous color injection - like pouring ink
            if (!this._injectionFrameCount) {
                this._injectionFrameCount = 0;
            }
            this._injectionFrameCount++;
            
            // Log every 30 frames (every ~0.5 seconds at 60fps)
            if (this._injectionFrameCount % 30 === 1) {
                console.log(`🎨 Injecting... ${this._injectionFrameCount} frames at`, x.toFixed(2), y.toFixed(2));
            }
            
            // Larger radius for overlapping/merging splats (creates continuous pool)
            this.simulation.splat(x, y, this.currentColor, 0.05);
        } else {
            if (this._injectionFrameCount) {
                console.log(`✅ Injection complete - ${this._injectionFrameCount} total frames`);
                this._injectionFrameCount = 0;
            }
        } 
        
        if (this.isRightMouseDown) {
            // Jet impulse - VERY strong forces to survive viscosity/pressure damping
            const speed = Math.sqrt(dx * dx + dy * dy);
            
            if (speed > 0.001) {
                // Moving: directional jet (scaled for resolution)
                const forceMultiplier = 5000.0;
                const vx = dx * forceMultiplier;
                const vy = dy * forceMultiplier;
                this.simulation.splatVelocity(x, y, vx, vy, 0.2);
            } else {
                // Stationary: explosive radial burst
                const burstStrength = 500.0;
                const burstRadius = 0.2;
                
                for (let i = 0; i < 8; i++) {
                    const angle = i * (Math.PI / 4);
                    const vx = Math.cos(angle) * burstStrength;
                    const vy = Math.sin(angle) * burstStrength;
                    this.simulation.splatVelocity(x, y, vx, vy, burstRadius);
                }
            }
        }
    }

    onKeyDown(e) {
        // Container rotation controls (increased to 0.2 for better visibility)
        if (e.key === 'ArrowLeft' || e.key === 'a') {
            this.simulation.setRotation(0.2);
            console.log('Rotating counter-clockwise: 0.2');
        } else if (e.key === 'ArrowRight' || e.key === 'd') {
            this.simulation.setRotation(-0.2);
            console.log('Rotating clockwise: -0.2');
        } else if (e.key === 'ArrowUp') {
            this.simulation.setRotation(0.2);
        } else if (e.key === 'ArrowDown') {
            this.simulation.setRotation(-0.2);
        }
        
        // Space + mouse for alternative jet mode
        else if (e.key === ' ') {
            this.isSpacePressed = true;
            e.preventDefault();
        }
        
        // Viscosity controls
        else if (e.key === 'v') {
            // Cycle viscosity: 0.1 -> 0.5 -> 1.0 -> 2.0 -> 0.1
            const viscosities = [0.1, 0.5, 1.0, 2.0];
            const currentIndex = viscosities.findIndex(v => Math.abs(v - this.simulation.viscosity) < 0.05);
            const nextIndex = (currentIndex + 1) % viscosities.length;
            this.simulation.viscosity = viscosities[nextIndex];
            console.log(`Viscosity: ${this.simulation.viscosity} (lower = more responsive jets)`);
        }
        
        // Diffusion controls (molecular spreading)
        else if (e.key === 'd') {
            // D key: Cycle diffusion rates (realistic to fast)
            const rates = [0.0001, 0.001, 0.01, 0.1];
            const currentIndex = rates.findIndex(r => Math.abs(r - this.simulation.diffusionRate) < 0.00005);
            const nextIndex = (currentIndex + 1) % rates.length;
            this.simulation.diffusionRate = rates[nextIndex];
            console.log(`🌊 Diffusion: ${this.simulation.diffusionRate} (molecular spreading rate)`);
        }
        
        // Vorticity confinement controls
        else if (e.key === 't') {
            // T key: Cycle turbulence strength (vorticity confinement)
            const strengths = [0.0, 0.1, 0.3, 0.5, 1.0];
            const currentIndex = strengths.findIndex(s => Math.abs(s - this.simulation.vorticityStrength) < 0.05);
            const nextIndex = (currentIndex + 1) % strengths.length;
            this.simulation.vorticityStrength = strengths[nextIndex];
            console.log(`🌀 Turbulence: ${this.simulation.vorticityStrength} (vorticity confinement)`);
        }
        
        // Pause/Resume (F004 requirement: freeze state for debugging)
        else if (e.key === 'p') {
            this.simulation.paused = !this.simulation.paused;
            console.log(this.simulation.paused ? '⏸️  Paused (colors stay put) - Try painting now!' : '▶️  Resumed');
        }
        
        // Debug visualization
        else if (e.key === 'm') {
            // M key: Toggle velocity visualization mode
            this.renderer.toggleDebugMode();
            console.log('🔍 Debug mode toggled');
        }
        
        // Testing shortcuts
        else if (e.key === 't' && e.ctrlKey) {
            // Ctrl+T: Run tests
            if (window.tester) {
                window.tester.runTests();
            }
        }
        else if (e.key === 's' && e.ctrlKey) {
            // Ctrl+S: Save state
            if (window.tester) {
                const state = window.tester.captureState('manual-save');
                window.tester.saveState(state);
            }
        }
    }

    onKeyUp(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || 
            e.key === 'ArrowRight' || e.key === 'd' ||
            e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            this.simulation.setRotation(0.0);
        } else if (e.key === ' ') {
            this.isSpacePressed = false;
        }
    }

    onTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.gl.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = 1.0 - (touch.clientY - rect.top) / rect.height;
        
        // Initialize position
        this.currentMouseX = x;
        this.currentMouseY = y;
        this.lastMouseX = x;
        this.lastMouseY = y;
        
        // Single touch = left-click (paint)
        // Two fingers = jet (handled in touchmove)
        if (e.touches.length === 1) {
            this.isMouseDown = true;
            console.log('👆 Touch start: paint mode');
        } else if (e.touches.length === 2) {
            this.isRightMouseDown = true;
            console.log('👆👆 Two-finger touch: jet mode');
        }
    }

    onTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.gl.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = 1.0 - (touch.clientY - rect.top) / rect.height;
        
        // Update current position
        this.currentMouseX = x;
        this.currentMouseY = y;
        
        // Calculate touch velocity
        const dx = x - this.lastMouseX;
        const dy = y - this.lastMouseY;
        this.mouseVelocityX = dx;
        this.mouseVelocityY = dy;
        this.lastMouseX = x;
        this.lastMouseY = y;
    }

    onTouchEnd(e) {
        e.preventDefault();
        if (e.touches.length === 0) {
            this.isMouseDown = false;
            this.isRightMouseDown = false;
            console.log('👋 Touch end');
        } else if (e.touches.length === 1) {
            // Down to one finger
            this.isRightMouseDown = false;
        }
    }

    onColorChange(e) {
        const hex = e.target.value;
        const r = parseInt(hex.substring(1, 3), 16) / 255;
        const g = parseInt(hex.substring(3, 5), 16) / 255;
        const b = parseInt(hex.substring(5, 7), 16) / 255;
        
        // Update current color for splats
        this.currentColor = { r, g, b };
        console.log(`🎨 Color changed to ${hex}`);
        
        // DON'T update background - keep it black for contrast!
        // this.renderer.setBackgroundColor({ r, g, b });
    }
}

