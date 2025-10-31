import Simulation from './simulation.js';
import { QualityTester } from './quality-tests.js';

export default class Controller {
    constructor(simulation, renderer) {
        this.simulation = simulation;
        this.renderer = renderer;
        this.gl = simulation.gl;
        this.qualityTester = new QualityTester(simulation);

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
        // Disable native gesture handling so touches map to paint/jets
        canvas.style.touchAction = 'none';
        
        // Bind event listeners
        this.canvas = canvas;
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        // Touch input (painting and jets on mobile)
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        this.canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
        
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Jet control: repeat while held
        this.didJetThisClick = false; // kept for initial state logging
        this.lastJetTime = 0;
        this.jetIntervalMs = 250; // safe sustained repeat cadence
        this.maxJetDurationMs = 2000; // hard cap per click
        this.jetHoldStart = 0;
        
        // Light color rotation (for volumetric rendering)
        this.lightHue = 0; // 0-360 degrees
        this.lightRotationSpeed = 0; // degrees per frame (0 = off)
        
        // Create light indicator UI
        this.createLightIndicator();
        
        // Create rotation button
        this.createRotationButton();
        
        // Create hamburger menu
        this.createHamburgerMenu();
        
        // Create color wheel
        this.createColorWheel();
    }
    
    createColorWheel() {
        this.colorWheel = document.createElement('div');
        // Smaller on mobile to avoid canvas overlap
        const isMobile = window.innerWidth <= 768;
        const size = isMobile ? 60 : 80;
        const top = isMobile ? 15 : 20;
        const left = isMobile ? 15 : 20;
        
        this.colorWheel.style.cssText = `
            position: fixed;
            top: ${top}px;
            left: ${left}px;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: conic-gradient(
                red, yellow, lime, cyan, blue, magenta, red
            );
            border: 3px solid rgba(255, 255, 255, 0.6);
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        `;
        
        // Click anywhere on wheel to select color
        this.colorWheel.addEventListener('click', (e) => {
            const rect = this.colorWheel.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const x = e.clientX - rect.left - centerX;
            const y = e.clientY - rect.top - centerY;
            
            // Calculate angle (0-360)
            let angle = Math.atan2(y, x) * 180 / Math.PI;
            if (angle < 0) angle += 360;
            
            // Convert to HSV color
            const h = angle;
            const s = 1.0;
            const v = 1.0;
            
            // Convert HSV to RGB
            const hue = h / 60;
            const i = Math.floor(hue);
            const f = hue - i;
            const q = 1 - f;
            
            let r, g, b;
            switch (i % 6) {
                case 0: r = 1; g = f; b = 0; break;
                case 1: r = q; g = 1; b = 0; break;
                case 2: r = 0; g = 1; b = f; break;
                case 3: r = 0; g = q; b = 1; break;
                case 4: r = f; g = 0; b = 1; break;
                case 5: r = 1; g = 0; b = q; break;
            }
            
            this.currentColor = { r, g, b };
            console.log(`🎨 Color: hue ${Math.round(h)}°`);
        });
        
        document.body.appendChild(this.colorWheel);
    }
    
    createLightIndicator() {
        this.lightIndicator = document.createElement('div');
        this.lightIndicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: 3px solid rgba(255, 255, 255, 0.6);
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
            z-index: 1000;
            cursor: pointer;
            background: black;
        `;
        
        // Click to cycle rotation speed
        this.lightIndicator.addEventListener('click', () => {
            const speeds = [0, 0.5, 1.0, 2.0, 5.0];
            const currentIndex = speeds.findIndex(s => Math.abs(s - this.lightRotationSpeed) < 0.1);
            const nextIndex = (currentIndex + 1) % speeds.length;
            this.lightRotationSpeed = speeds[nextIndex];
            console.log(`💡 Light rotation: ${this.lightRotationSpeed === 0 ? 'OFF' : this.lightRotationSpeed + '°/frame'}`);
        });
        
        document.body.appendChild(this.lightIndicator);
    }
    
    updateLightIndicator(r, g, b) {
        const rgb = `rgb(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)})`;
        this.lightIndicator.style.backgroundColor = rgb;
        this.lightIndicator.style.boxShadow = `0 0 20px ${rgb}`;
    }
    
    createRotationButton() {
        this.rotationButton = document.createElement('button');
        this.rotationButton.innerHTML = '↻';
        this.rotationButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: 3px solid rgba(255, 255, 255, 0.6);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 32px;
            cursor: pointer;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        `;
        
        this.rotationButton.addEventListener('click', () => {
            if (this.simulation.rotationAmount === 0) {
                this.simulation.setRotation(0.2);
                this.rotationButton.style.background = 'rgba(0, 150, 255, 0.7)';
                console.log('🔄 Rotation: ON');
            } else {
                this.simulation.setRotation(0.0);
                this.rotationButton.style.background = 'rgba(0, 0, 0, 0.7)';
                console.log('🔄 Rotation: OFF');
            }
        });
        
        document.body.appendChild(this.rotationButton);
    }
    
    createHamburgerMenu() {
        // Hamburger button
        this.menuButton = document.createElement('button');
        this.menuButton.innerHTML = '☰';
        this.menuButton.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border: none;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 28px;
            cursor: pointer;
            z-index: 1001;
            border-radius: 8px;
        `;
        
        // Menu panel
        this.menuPanel = document.createElement('div');
        this.menuPanel.style.cssText = `
            position: fixed;
            top: 0;
            right: -320px;
            width: 300px;
            height: 100vh;
            background: rgba(0, 0, 0, 0.95);
            color: white;
            z-index: 1000;
            transition: right 0.3s;
            overflow: hidden;
            padding: 80px 20px 20px 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        
        this.menuPanel.innerHTML = `
            <h2 style="margin: 0 0 20px 0; font-size: 24px;">Controls</h2>
            
            <div style="margin-bottom: 30px;">
                <h3 style="font-size: 16px; opacity: 0.7; margin: 0 0 10px 0;">Rendering</h3>
                <div class="menu-toggle" data-key="useVolumetric" data-obj="renderer">
                    <span>Volumetric (L)</span>
                    <span class="toggle-state">ON</span>
                </div>
                <div class="menu-toggle" data-key="usePostProcessing" data-obj="renderer">
                    <span>Organic Flow (O)</span>
                    <span class="toggle-state">ON</span>
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h3 style="font-size: 16px; opacity: 0.7; margin: 0 0 10px 0;">Simulation</h3>
                <div class="menu-toggle" data-key="paused" data-obj="simulation">
                    <span>Paused (P)</span>
                    <span class="toggle-state">OFF</span>
                </div>
                <div class="menu-action" data-action="viscosity" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; cursor: pointer;">
                    <span>Viscosity (V)</span>
                    <span class="viscosity-value" style="opacity: 0.7; font-size: 12px;">0.02</span>
                </div>
                <div class="menu-action" data-action="boundary" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; cursor: pointer;">
                    <span>Boundary (B)</span>
                    <span class="boundary-value" style="opacity: 0.7; font-size: 12px;">Viscous Drag</span>
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h3 style="font-size: 16px; opacity: 0.7; margin: 0 0 10px 0;">Actions</h3>
                <button class="menu-action" data-action="clear" style="width: 100%; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer;">
                    Clear Canvas (X)
                </button>
                <button class="menu-action" data-action="quality" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer;">
                    Run Quality Tests (Ctrl+Q)
                </button>
            </div>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.2);">
                <a href="https://github.com/andyed/liquid-light-sim" target="_blank" style="color: #4de5ff; text-decoration: none; display: block; margin-bottom: 10px;">
                    📦 View on GitHub
                </a>
                <div style="opacity: 0.5; font-size: 12px;">
                    Liquid Light Simulator<br>
                    WebGL2 Fluid Dynamics
                </div>
            </div>
        `;
        
        // Add styles for toggles
        const style = document.createElement('style');
        style.textContent = `
            .menu-toggle {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                margin-bottom: 8px;
                background: rgba(255,255,255,0.05);
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .menu-toggle:hover {
                background: rgba(255,255,255,0.1);
            }
            .toggle-state {
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: bold;
            }
            .toggle-state.on {
                background: #4de5ff;
                color: black;
            }
            .toggle-state.off {
                background: rgba(255,255,255,0.2);
                color: white;
            }
            .menu-action:hover {
                background: rgba(255,255,255,0.2);
            }
        `;
        document.head.appendChild(style);
        
        // Toggle menu
        let menuOpen = false;
        this.menuButton.addEventListener('click', () => {
            menuOpen = !menuOpen;
            this.menuPanel.style.right = menuOpen ? '0' : '-320px';
            this.updateMenuStates();
        });
        
        // Handle toggle clicks
        this.menuPanel.addEventListener('click', (e) => {
            const toggle = e.target.closest('.menu-toggle');
            if (toggle) {
                const key = toggle.dataset.key;
                const obj = toggle.dataset.obj === 'renderer' ? this.renderer : this.simulation;
                obj[key] = !obj[key];
                this.updateMenuStates();
                console.log(`${key}: ${obj[key] ? 'ON' : 'OFF'}`);
            }
            
            const action = e.target.closest('.menu-action');
            if (action) {
                if (action.dataset.action === 'clear') {
                    this.simulation.clearColor();
                    console.log('🧹 Canvas cleared');
                } else if (action.dataset.action === 'quality') {
                    this.qualityTester.runTests();
                } else if (action.dataset.action === 'viscosity') {
                    this.cycleViscosity();
                    this.updateMenuStates();
                } else if (action.dataset.action === 'boundary') {
                    this.cycleBoundaryMode();
                    this.updateMenuStates();
                }
            }
        });
        
        document.body.appendChild(this.menuButton);
        document.body.appendChild(this.menuPanel);
    }
    
    updateMenuStates() {
        const toggles = this.menuPanel.querySelectorAll('.menu-toggle');
        toggles.forEach(toggle => {
            const key = toggle.dataset.key;
            const obj = toggle.dataset.obj === 'renderer' ? this.renderer : this.simulation;
            const state = toggle.querySelector('.toggle-state');
            const isOn = obj[key];
            state.textContent = isOn ? 'ON' : 'OFF';
            state.className = `toggle-state ${isOn ? 'on' : 'off'}`;
        });
        
        // Update viscosity display
        const viscosityValue = this.menuPanel.querySelector('.viscosity-value');
        if (viscosityValue) {
            viscosityValue.textContent = this.simulation.viscosity.toFixed(2);
        }
        
        // Update boundary mode display
        const boundaryValue = this.menuPanel.querySelector('.boundary-value');
        if (boundaryValue) {
            const modes = ['Bounce', 'Viscous Drag', 'Repulsive Force'];
            boundaryValue.textContent = modes[this.simulation.boundaryMode];
        }
    }
    
    cycleViscosity() {
        const viscosities = [0.02, 0.05, 0.1, 0.5, 1.0, 2.0];
        const currentIndex = viscosities.findIndex(v => Math.abs(v - this.simulation.viscosity) < 0.01);
        const nextIndex = (currentIndex + 1) % viscosities.length;
        this.simulation.viscosity = viscosities[nextIndex];
        console.log(`💧 Viscosity: ${this.simulation.viscosity} (${['Ultra Low', 'Very Low', 'Low', 'Medium', 'High', 'Very High'][nextIndex]})`);
    }
    
    cycleBoundaryMode() {
        const modes = ['Bounce', 'Viscous Drag', 'Repulsive Force'];
        this.simulation.boundaryMode = (this.simulation.boundaryMode + 1) % 3;
        console.log(`🔲 Boundary: ${modes[this.simulation.boundaryMode]} (mode ${this.simulation.boundaryMode})`);
    }
    
    update() {
        // Update light rotation
        if (this.lightRotationSpeed > 0) {
            this.lightHue = (this.lightHue + this.lightRotationSpeed) % 360;
            
            // Convert HSV to RGB (S=1, V=1 for pure colors)
            const h = this.lightHue / 60;
            const i = Math.floor(h);
            const f = h - i;
            const q = 1 - f;
            const t = f;
            
            let r, g, b;
            switch (i % 6) {
                case 0: r = 1; g = t; b = 0; break;
                case 1: r = q; g = 1; b = 0; break;
                case 2: r = 0; g = 1; b = t; break;
                case 3: r = 0; g = q; b = 1; break;
                case 4: r = t; g = 0; b = 1; break;
                case 5: r = 1; g = 0; b = q; break;
            }
            
            // Set as background color (light source)
            this.renderer.backgroundColor = { r, g, b };
            this.updateLightIndicator(r, g, b);
        } else {
            // No rotation - keep black background
            this.renderer.backgroundColor = { r: 0, g: 0, b: 0 };
            this.updateLightIndicator(0, 0, 0);
        }
        
        // Handle continuous injection
        if (this.isMouseDown && !this.isRightMouseDown) {
            const x = this.currentMouseX;
            const y = this.currentMouseY;
            
            if (!this._injectionFrameCount) {
                this._injectionFrameCount = 0;
            }
            this._injectionFrameCount++;
            
            // Log every 60 frames
            if (this._injectionFrameCount % 60 === 1) {
                console.log(`🎨 Injecting... ${this._injectionFrameCount} frames at`, x.toFixed(2), y.toFixed(2));
            }
            
            // Continuous source injection (source term in advection-diffusion equation)
            // Larger radius creates smooth concentration gradient
            this.simulation.splat(x, y, this.currentColor, 0.08);
        } else {
            if (this._injectionFrameCount) {
                console.log(`✅ Injection complete - ${this._injectionFrameCount} total frames`);
                this._injectionFrameCount = 0;
            }
        }
        
        // Handle jets (right-click): repeat while held
        if (this.isRightMouseDown) {
            const now = performance.now();
            // Stop after max duration (require re-click to continue)
            if (now - this.jetHoldStart >= this.maxJetDurationMs) {
                this.isRightMouseDown = false;
                this.didJetThisClick = false;
                console.log('🧨 Jet: auto-stop (duration cap)');
                return;
            }
            if (now - this.lastJetTime < this.jetIntervalMs) {
                return; // wait for next interval
            }
            const x = this.currentMouseX;
            const y = this.currentMouseY;
            
            // Curl-preserving ring burst (tangential) so projection doesn't cancel it
            const directions = 12;
            const ringRadius = 0.025; // tighter ring
            const burstStrength = 60.0; // gentler tangential speed for long holds
            const splatRadius = 0.05; // smaller influence per spoke
            
            for (let i = 0; i < directions; i++) {
                const angle = (i / directions) * Math.PI * 2;
                const dirX = Math.cos(angle);
                const dirY = Math.sin(angle);
                // Position around a small ring
                const px = x + dirX * ringRadius;
                const py = y + dirY * ringRadius;
                // Tangential velocity (perpendicular to radius vector)
                const vx = -dirY * burstStrength;
                const vy =  dirX * burstStrength;
                this.simulation.splatVelocity(px, py, vx, vy, splatRadius);
            }
            this.didJetThisClick = true;
            this.lastJetTime = now;
            console.log(`🌊 Jet ring @(${x.toFixed(3)}, ${y.toFixed(3)})`, {strength: burstStrength, ringRadius, splatRadius, directions});
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
            this.isMouseDown = true;
            console.log('Paint: start');
        } else if (e.button === 2) {
            // Right click - jet impulse tool
            this.isRightMouseDown = true;
            this.didJetThisClick = false;
            // allow immediate first burst
            this.lastJetTime = 0;
            this.jetHoldStart = performance.now();
            console.log('Jet: armed');
        }
    }

    onMouseUp(e) {
        if (e.button === 0) {
            this.isMouseDown = false;
        } else if (e.button === 2) {
            this.isRightMouseDown = false;
            this.didJetThisClick = false;
            console.log('🧨 Jet: end');
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
            // Cycle viscosity: 0.05 -> 0.1 -> 0.5 -> 1.0 -> 2.0 -> 0.05
            const viscosities = [0.05, 0.1, 0.5, 1.0, 2.0];
            const currentIndex = viscosities.findIndex(v => Math.abs(v - this.simulation.viscosity) < 0.03);
            const nextIndex = (currentIndex + 1) % viscosities.length;
            this.simulation.viscosity = viscosities[nextIndex];
            console.log(`Viscosity: ${this.simulation.viscosity} (lower = longer-lasting vortices)`);
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
        
        // Boundary mode controls
        else if (e.key === 'b') {
            // B key: Cycle boundary mode
            const modes = ['Bounce', 'Viscous Drag', 'Repulsive Force'];
            this.simulation.boundaryMode = (this.simulation.boundaryMode + 1) % 3;
            console.log(`🔲 Boundary: ${modes[this.simulation.boundaryMode]} (mode ${this.simulation.boundaryMode})`);
        }
        
        // Light color rotation
        else if (e.key === 'c' || e.key === 'C') {
            // C key: Cycle light rotation speed
            const speeds = [0, 0.5, 1.0, 2.0, 5.0];
            const currentIndex = speeds.findIndex(s => Math.abs(s - this.lightRotationSpeed) < 0.1);
            const nextIndex = (currentIndex + 1) % speeds.length;
            this.lightRotationSpeed = speeds[nextIndex];
            console.log(`💡 Light rotation: ${this.lightRotationSpeed === 0 ? 'OFF' : this.lightRotationSpeed + '°/frame'}`);
        }
        
        // Clear canvas
        else if (e.key === 'x') {
            // X key: Clear all ink
            this.simulation.clearColor();
            console.log('🧹 Canvas cleared');
        }
        
        // Volumetric rendering controls
        else if (e.key === 'l') {
            // L key: Toggle volumetric rendering
            this.renderer.useVolumetric = !this.renderer.useVolumetric;
            console.log(`💡 Volumetric rendering: ${this.renderer.useVolumetric ? 'ON' : 'OFF'}`);
        }
        
        // Post-processing controls
        else if (e.key === 'o') {
            // O key: Toggle organic flow distortion
            this.renderer.usePostProcessing = !this.renderer.usePostProcessing;
            console.log(`🌊 Organic flow: ${this.renderer.usePostProcessing ? 'ON' : 'OFF'} (${this.renderer.distortionStrength})`);
        }
        
        else if (e.key === 'k') {
            // K key: Cycle absorption coefficient
            const coefficients = [0.5, 1.0, 2.0, 4.0, 8.0];
            const currentIndex = coefficients.findIndex(c => Math.abs(c - this.renderer.absorptionCoefficient) < 0.1);
            const nextIndex = (currentIndex + 1) % coefficients.length;
            this.renderer.absorptionCoefficient = coefficients[nextIndex];
            console.log(`💡 Absorption: ${this.renderer.absorptionCoefficient} (higher = darker/richer)`);
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
        
        // Quality tests
        else if (e.key === 'q' && e.ctrlKey) {
            // Ctrl+Q: Run quality tests
            e.preventDefault();
            this.qualityTester.runTests();
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
        } else if (e.touches.length === 1) {
            this.isRightMouseDown = false;
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
        // Cycle viscosity: 0.05 -> 0.1 -> 0.5 -> 1.0 -> 2.0 -> 0.05
        const viscosities = [0.05, 0.1, 0.5, 1.0, 2.0];
        const currentIndex = viscosities.findIndex(v => Math.abs(v - this.simulation.viscosity) < 0.03);
        const nextIndex = (currentIndex + 1) % viscosities.length;
        this.simulation.viscosity = viscosities[nextIndex];
        console.log(`Viscosity: ${this.simulation.viscosity} (lower = longer-lasting vortices)`);
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
        
    // Light color rotation
    else if (e.key === 'c' || e.key === 'C') {
        // C key: Cycle light rotation speed
        const speeds = [0, 0.5, 1.0, 2.0, 5.0];
        const currentIndex = speeds.findIndex(s => Math.abs(s - this.lightRotationSpeed) < 0.1);
        const nextIndex = (currentIndex + 1) % speeds.length;
        this.lightRotationSpeed = speeds[nextIndex];
        console.log(`💡 Light rotation: ${this.lightRotationSpeed === 0 ? 'OFF' : this.lightRotationSpeed + '°/frame'}`);
    }
        
    // Clear canvas
    else if (e.key === 'x') {
        // X key: Clear all ink
        this.simulation.clearColor();
        console.log('🧹 Canvas cleared');
    }
        
    // Volumetric rendering controls
    else if (e.key === 'l') {
        // L key: Toggle volumetric rendering
        this.renderer.useVolumetric = !this.renderer.useVolumetric;
        console.log(`💡 Volumetric rendering: ${this.renderer.useVolumetric ? 'ON' : 'OFF'}`);
    }
        
    // Post-processing controls
    else if (e.key === 'o') {
        // O key: Toggle organic flow distortion
        this.renderer.usePostProcessing = !this.renderer.usePostProcessing;
        console.log(`🌊 Organic flow: ${this.renderer.usePostProcessing ? 'ON' : 'OFF'} (${this.renderer.distortionStrength})`);
    }
        
    else if (e.key === 'k') {
        // K key: Cycle absorption coefficient
        const coefficients = [0.5, 1.0, 2.0, 4.0, 8.0];
        const currentIndex = coefficients.findIndex(c => Math.abs(c - this.renderer.absorptionCoefficient) < 0.1);
        const nextIndex = (currentIndex + 1) % coefficients.length;
        this.renderer.absorptionCoefficient = coefficients[nextIndex];
        console.log(`💡 Absorption: ${this.renderer.absorptionCoefficient} (higher = darker/richer)`);
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
        
    // Quality tests
    else if (e.key === 'q' && e.ctrlKey) {
        // Ctrl+Q: Run quality tests
        e.preventDefault();
        this.qualityTester.runTests();
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
}
