export default class Controller {
    constructor(simulation) {
        this.simulation = simulation;
        this.renderer = simulation.renderer;
        this.gl = simulation.gl;

        this.isMouseDown = false;
        this.isRightMouseDown = false;
        this.isSpacePressed = false;
        this.currentColor = { r: 0.3, g: 0.7, b: 0.9 };  // Default color

        const canvas = this.gl.canvas;
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());  // Disable context menu

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        const colorPicker = document.getElementById('color-picker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => this.onColorChange(e));
        }
    }

    onMouseDown(e) {
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

        if (this.isMouseDown || (this.isSpacePressed && this.isRightMouseDown)) {
            // Normal splat - color injection with user's selected color
            this.simulation.splat(x, y, this.currentColor, 0.02);
        } 
        
        if (this.isRightMouseDown) {
            // Jet impulse - PURE VELOCITY ONLY (no color at all)
            // Creates turbulent forces that stir existing colors
            const vx = (Math.random() - 0.5) * 2.0;  
            const vy = (Math.random() - 0.5) * 2.0;  
            
            // Inject velocity only - no visual trace
            this.simulation.splatVelocity(x, y, vx, vy, 0.06);
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
            // Cycle viscosity: 0.5 -> 1.0 -> 2.0 -> 5.0 -> 0.5
            const viscosities = [0.5, 1.0, 2.0, 5.0];
            const currentIndex = viscosities.findIndex(v => Math.abs(v - this.simulation.viscosity) < 0.1);
            const nextIndex = (currentIndex + 1) % viscosities.length;
            this.simulation.viscosity = viscosities[nextIndex];
            console.log(`Viscosity: ${this.simulation.viscosity}`);
        }
        
        // Pause/Resume (F004 requirement: freeze state for debugging)
        else if (e.key === 'p') {
            this.simulation.paused = !this.simulation.paused;
            console.log(this.simulation.paused ? '⏸️  Paused' : '▶️  Resumed');
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

    onColorChange(e) {
        const hex = e.target.value;
        const r = parseInt(hex.substring(1, 3), 16) / 255;
        const g = parseInt(hex.substring(3, 5), 16) / 255;
        const b = parseInt(hex.substring(5, 7), 16) / 255;
        
        // Update current color for splats
        this.currentColor = { r, g, b };
        
        // Update background color
        this.renderer.setBackgroundColor({ r, g, b });
    }
}

