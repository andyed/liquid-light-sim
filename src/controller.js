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
        this.materials = [
            { name: 'Ink', palette: ['#4DE5FF', '#FF3B3B', '#FFD93B', '#9B59B6', '#2ECC71'], preset: { useOil: true, oilSmoothingRate: 0.0, oilViscosity: 0.0, oilViscosityIterations: 0, couplingStrength: 0.0, absorption: 3.0, paletteDom: 0.15, refractStrength: 0.0, fresnelPower: 3.0, oilOcclusion: 0.0, oilAlphaGamma: 1.0, marangoniStrength: 0.0, marangoniKth: 0.8, marangoniEdgeBand: 2.0 } },
            { name: 'Mineral Oil', palette: ['#FFF3C4', '#FFD166', '#F6BD60', '#F7EDE2', '#F28482'], preset: { useOil: true, oilSmoothingRate: 0.0035, oilViscosity: 0.75, oilViscosityIterations: 90, couplingStrength: 0.003, absorption: 3.5, paletteDom: 0.12, refractStrength: 0.010, fresnelPower: 3.0, oilOcclusion: 0.45, oilAlphaGamma: 1.10, marangoniStrength: 0.45, marangoniKth: 0.8, marangoniEdgeBand: 2.0 } },
            { name: 'Alcohol', palette: ['#BDE0FE', '#A2D2FF', '#CDB4DB', '#FFC8DD', '#FFAFCC'], preset: { useOil: true, oilSmoothingRate: 0.0010, oilViscosity: 0.15, oilViscosityIterations: 30, couplingStrength: 0.001, absorption: 2.5, paletteDom: 0.20, refractStrength: 0.007, fresnelPower: 2.8, oilOcclusion: 0.30, oilAlphaGamma: 0.90, marangoniStrength: 0.25, marangoniKth: 0.4, marangoniEdgeBand: 1.5 } },
            { name: 'Syrup', palette: ['#8B4513', '#D2691E', '#C97A36', '#F4A261', '#E76F51'], preset: { useOil: true, oilSmoothingRate: 0.0050, oilViscosity: 3.0, oilViscosityIterations: 200, couplingStrength: 0.002, absorption: 4.0, paletteDom: 0.12, refractStrength: 0.012, fresnelPower: 3.2, oilOcclusion: 0.60, oilAlphaGamma: 1.20, marangoniStrength: 0.60, marangoniKth: 1.0, marangoniEdgeBand: 2.5 } },
            { name: 'Glycerine', palette: ['#E0FBFC', '#98C1D9', '#3D5A80', '#EE6C4D', '#293241'], preset: { useOil: true, oilSmoothingRate: 0.0060, oilViscosity: 2.4, oilViscosityIterations: 160, couplingStrength: 0.003, absorption: 4.5, paletteDom: 0.10, refractStrength: 0.015, fresnelPower: 3.5, oilOcclusion: 0.70, oilAlphaGamma: 1.30, marangoniStrength: 0.70, marangoniKth: 1.2, marangoniEdgeBand: 3.0 } }
        ];
        this.currentMaterialIndex = 0;
        
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
        // Ensure canvas can receive focus for keyboard events in mobile emulators
        canvas.setAttribute('tabindex', '0');
        try { canvas.focus(); } catch (e) {}
        
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
        // Also listen on window to catch keys when focus is not on document/canvas (mobile emulator)
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Jet control: repeat while held
        this.didJetThisClick = false; // kept for initial state logging
        this.lastJetTime = 0;
        this.jetIntervalMs = 250; // safe sustained repeat cadence
        this.injectEveryN = 2; // throttle paint injection to every N frames
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

        this.createMarangoniHUD();
    }

    setMaterial(index, autoPick = true) {
        const clamped = Math.max(0, Math.min(this.materials.length - 1, index));
        this.currentMaterialIndex = clamped;
        if (autoPick) {
            this.autoPickColorForMaterial();
        }
        // Apply material preset (which includes useOil flag)
        this.applyMaterialPreset();
        this.updateMaterialReadout();
        console.log(`🧪 Material: ${this.materials[this.currentMaterialIndex].name}`);
    }

    applyMaterialPreset() {
        const mat = this.materials[this.currentMaterialIndex];
        if (!mat || !mat.preset) return;
        const p = mat.preset;
        // Apply useOil flag from preset
        if (typeof p.useOil === 'boolean') {
            this.simulation.useOil = p.useOil;
        }
        // Oil smoothing rate
        if (typeof p.oilSmoothingRate === 'number') {
            this.simulation.oilSmoothingRate = p.oilSmoothingRate;
        }
        // Oil viscosity parameters
        if (typeof p.oilViscosity === 'number') {
            this.simulation.oilViscosity = p.oilViscosity;
        }
        if (typeof p.oilViscosityIterations === 'number') {
            this.simulation.oilViscosityIterations = p.oilViscosityIterations;
        }
        // Oil → Water coupling strength
        if (typeof p.couplingStrength === 'number') {
            this.simulation.couplingStrength = p.couplingStrength;
        }
        // Renderer knobs
        if (typeof p.absorption === 'number') {
            this.renderer.absorptionCoefficient = p.absorption;
        }
        if (typeof p.paletteDom === 'number') {
            this.renderer.paletteDominance = p.paletteDom;
        }
        if (typeof p.refractStrength === 'number') {
            this.renderer.oilRefractStrength = p.refractStrength;
        }
        if (typeof p.fresnelPower === 'number') {
            this.renderer.oilFresnelPower = p.fresnelPower;
        }
        if (typeof p.oilOcclusion === 'number') {
            this.renderer.oilOcclusion = p.oilOcclusion;
        }
        if (typeof p.oilAlphaGamma === 'number') {
            this.renderer.oilAlphaGamma = p.oilAlphaGamma;
        }
        // Marangoni
        if (typeof p.marangoniStrength === 'number') {
            this.simulation.marangoniStrength = p.marangoniStrength;
        }
        if (typeof p.marangoniKth === 'number') {
            this.simulation.marangoniKth = p.marangoniKth;
        }
        if (typeof p.marangoniEdgeBand === 'number') {
            this.simulation.marangoniEdgeBand = p.marangoniEdgeBand;
        }
        // Menu reflects changes
        if (this.menuPanel) this.updateMenuStates();
        this.updateMarangoniHUD();
    }

    autoPickColorForMaterial() {
        const mat = this.materials[this.currentMaterialIndex];
        if (!mat || !mat.palette || mat.palette.length === 0) return;
        const hex = mat.palette[Math.floor(Math.random() * mat.palette.length)];
        const rgb = this.hexToRgb01(hex);
        this.currentColor = this.toneColor(rgb);
        this.updateMaterialReadout();
        console.log(`🎨 Auto color for ${mat.name}: ${hex}`);
    }

    updateMaterialReadout() {
        if (!this.materialReadout) return;
        const matName = this.materials[this.currentMaterialIndex]?.name || 'Ink';
        const hex = this.rgb01ToHex(this.currentColor);
        this.materialReadout.innerHTML = `
            <span style="color:${hex}; font-weight:600; text-shadow: 0 0 6px rgba(0,0,0,0.6)">${matName}</span>
        `;
    }

    hexToRgb01(hex) {
        const m = hex.replace('#','');
        const r = parseInt(m.substring(0,2), 16) / 255;
        const g = parseInt(m.substring(2,4), 16) / 255;
        const b = parseInt(m.substring(4,6), 16) / 255;
        return { r, g, b };
    }

    rgb01ToHex({r,g,b}) {
        const to = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
        const rr = to(r).toString(16).padStart(2,'0');
        const gg = to(g).toString(16).padStart(2,'0');
        const bb = to(b).toString(16).padStart(2,'0');
        return `#${rr}${gg}${bb}`;
    }

    toneColor({ r, g, b }) {
        // Reduce value (brightness)
        const vFactor = 0.85;
        let rr = r * vFactor;
        let gg = g * vFactor;
        let bb = b * vFactor;
        // Reduce saturation by lerping toward luminance
        const satFactor = 0.85;
        const avg = (rr + gg + bb) / 3.0;
        rr = avg + (rr - avg) * satFactor;
        gg = avg + (gg - avg) * satFactor;
        bb = avg + (bb - avg) * satFactor;
        // Clamp
        rr = Math.max(0, Math.min(1, rr));
        gg = Math.max(0, Math.min(1, gg));
        bb = Math.max(0, Math.min(1, bb));
        return { r: rr, g: gg, b: bb };
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
            
            // Tone down saturation/value to avoid canvas washout
            const toned = this.toneColor({ r, g, b });
            this.currentColor = toned;
            this.updateMaterialReadout();
            console.log(`🎨 Color: hue ${Math.round(h)}°`);
        });
        
        document.body.appendChild(this.colorWheel);

        // Material readout below the color wheel
        this.materialReadout = document.createElement('div');
        this.materialReadout.style.cssText = `
            position: fixed;
            top: ${top + size + 8}px;
            left: ${left}px;
            font-size: ${isMobile ? 11 : 12}px;
            color: rgba(255,255,255,0.85);
            background: rgba(0,0,0,0.4);
            padding: 6px 8px;
            border-radius: 6px;
            user-select: none;
            z-index: 1000;
        `;
        this.updateMaterialReadout();
        document.body.appendChild(this.materialReadout);
    }
    
    createMarangoniHUD() {
        this.marangoniHUD = document.createElement('div');
        this.marangoniHUD.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 20px;
            padding: 6px 8px;
            background: rgba(0,0,0,0.5);
            color: white;
            font-size: 12px;
            border-radius: 6px;
            z-index: 1000;
            user-select: none;
        `;
        document.body.appendChild(this.marangoniHUD);
        this.updateMarangoniHUD();
    }

    updateMarangoniHUD() {
        if (!this.marangoniHUD) return;
        const modeNames = ['COLOR', 'VELOCITY', 'CONC GRAD', 'OIL THICK', 'OIL GRAD'];
        const dm = this.renderer?.debugMode ?? 0;
        const view = dm !== 0 ? ` | View: ${modeNames[dm]}` : '';
        this.marangoniHUD.textContent = `Marangoni  S:${this.simulation.marangoniStrength.toFixed(2)}  k:${this.simulation.marangoniKth.toFixed(2)}  band:${this.simulation.marangoniEdgeBand.toFixed(2)}px${view}`;
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
            if (this.simulation.rotationBase === 0) {
                this.simulation.setRotation(1.2);
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
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
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
                <div class="menu-action" data-action="absorption" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-top: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; cursor: pointer;">
                    <span>Absorption (K)</span>
                    <span class="absorption-value" style="opacity: 0.7; font-size: 12px;">3.0</span>
                </div>
                <div class="menu-action" data-action="palette" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-top: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; cursor: pointer;">
                    <span>Palette Dominance</span>
                    <span class="palette-value" style="opacity: 0.7; font-size: 12px;">0.15</span>
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h3 style="font-size: 16px; opacity: 0.7; margin: 0 0 10px 0;">Simulation</h3>
                <div class="menu-toggle" data-key="paused" data-obj="simulation">
                    <span>Paused (P)</span>
                    <span class="toggle-state">OFF</span>
                </div>
                <div class="menu-toggle" data-key="useOil" data-obj="simulation">
                    <span>Oil Layer</span>
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
                <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.04); border-radius: 6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span>Marangoni Strength</span>
                        <div>
                            <button class="menu-action" data-action="marangoni-strength-dec" style="padding:4px 8px; margin-right:4px;">−</button>
                            <span class="marangoni-strength-value" style="opacity:0.8; font-size:12px; min-width:40px; display:inline-block; text-align:center;">0.00</span>
                            <button class="menu-action" data-action="marangoni-strength-inc" style="padding:4px 8px; margin-left:4px;">+</button>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span>k_th</span>
                        <div>
                            <button class="menu-action" data-action="marangoni-kth-dec" style="padding:4px 8px; margin-right:4px;">−</button>
                            <span class="marangoni-kth-value" style="opacity:0.8; font-size:12px; min-width:40px; display:inline-block; text-align:center;">0.00</span>
                            <button class="menu-action" data-action="marangoni-kth-inc" style="padding:4px 8px; margin-left:4px;">+</button>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>Edge Band (px)</span>
                        <div>
                            <button class="menu-action" data-action="marangoni-band-dec" style="padding:4px 8px; margin-right:4px;">−</button>
                            <span class="marangoni-band-value" style="opacity:0.8; font-size:12px; min-width:40px; display:inline-block; text-align:center;">0.00</span>
                            <button class="menu-action" data-action="marangoni-band-inc" style="padding:4px 8px; margin-left:4px;">+</button>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 14px;">
                    <h3 style="font-size: 16px; opacity: 0.7; margin: 0 0 10px 0;">Materials (1‑5)</h3>
                    <div class="materials-row" style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${this.materials.map((m, i) => `
                            <button class="material-option" data-material-index="${i}" style="padding:8px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.08); color:white; cursor:pointer; font-size:12px;">${m.name}</button>
                        `).join('')}
                    </div>
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
                // Simply toggle the value (no special methods needed)
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
                } else if (action.dataset.action === 'absorption') {
                    this.cycleAbsorption();
                    this.updateMenuStates();
                } else if (action.dataset.action === 'marangoni-strength-dec') {
                    this.simulation.marangoniStrength = Math.max(0.0, this.simulation.marangoniStrength - 0.05);
                    this.updateMenuStates(); this.updateMarangoniHUD();
                } else if (action.dataset.action === 'marangoni-strength-inc') {
                    this.simulation.marangoniStrength = Math.min(2.0, this.simulation.marangoniStrength + 0.05);
                    this.updateMenuStates(); this.updateMarangoniHUD();
                } else if (action.dataset.action === 'marangoni-kth-dec') {
                    this.simulation.marangoniKth = Math.max(-2.0, this.simulation.marangoniKth - 0.05);
                    this.updateMenuStates(); this.updateMarangoniHUD();
                } else if (action.dataset.action === 'marangoni-kth-inc') {
                    this.simulation.marangoniKth = Math.min(3.0, this.simulation.marangoniKth + 0.05);
                    this.updateMenuStates(); this.updateMarangoniHUD();
                } else if (action.dataset.action === 'marangoni-band-dec') {
                    this.simulation.marangoniEdgeBand = Math.max(0.0, this.simulation.marangoniEdgeBand - 0.25);
                    this.updateMenuStates(); this.updateMarangoniHUD();
                } else if (action.dataset.action === 'marangoni-band-inc') {
                    this.simulation.marangoniEdgeBand = Math.min(10.0, this.simulation.marangoniEdgeBand + 0.25);
                    this.updateMenuStates(); this.updateMarangoniHUD();
                } else if (action.dataset.action === 'palette') {
                    this.cyclePaletteDominance();
                    this.updateMenuStates();
                }
            }

            const matBtn = e.target.closest('.material-option');
            if (matBtn) {
                const idx = parseInt(matBtn.dataset.materialIndex, 10) || 0;
                this.setMaterial(idx, true);
                this.updateMenuStates();
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

        // Update absorption display
        const absorptionValue = this.menuPanel.querySelector('.absorption-value');
        if (absorptionValue) {
            absorptionValue.textContent = this.renderer.absorptionCoefficient.toFixed(1);
        }
        
        // Update palette dominance display
        const paletteValue = this.menuPanel.querySelector('.palette-value');
        if (paletteValue) {
            paletteValue.textContent = this.renderer.paletteDominance.toFixed(2);
        }

        // Update Marangoni values
        const sEl = this.menuPanel.querySelector('.marangoni-strength-value');
        if (sEl) sEl.textContent = this.simulation.marangoniStrength.toFixed(2);
        const kEl = this.menuPanel.querySelector('.marangoni-kth-value');
        if (kEl) kEl.textContent = this.simulation.marangoniKth.toFixed(2);
        const bEl = this.menuPanel.querySelector('.marangoni-band-value');
        if (bEl) bEl.textContent = this.simulation.marangoniEdgeBand.toFixed(2);

        // Highlight selected material
        const matButtons = this.menuPanel.querySelectorAll('.material-option');
        matButtons.forEach((btn) => {
            const idx = parseInt(btn.dataset.materialIndex, 10) || 0;
            const selected = idx === this.currentMaterialIndex;
            btn.style.background = selected ? 'rgba(77,229,255,0.9)' : 'rgba(255,255,255,0.08)';
            btn.style.color = selected ? '#000' : '#fff';
        });
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

    cycleAbsorption() {
        const coefficients = [0.5, 1.0, 2.0, 4.0, 8.0];
        const currentIndex = coefficients.findIndex(c => Math.abs(c - this.renderer.absorptionCoefficient) < 0.1);
        const nextIndex = (currentIndex + 1) % coefficients.length;
        this.renderer.absorptionCoefficient = coefficients[nextIndex];
        console.log(`💡 Absorption: ${this.renderer.absorptionCoefficient} (higher = darker/richer)`);
    }
    
    cyclePaletteDominance() {
        const values = [0.0, 0.15, 0.3, 0.5, 0.7];
        const currentIndex = values.findIndex(v => Math.abs(v - this.renderer.paletteDominance) < 0.05);
        const nextIndex = (currentIndex + 1) % values.length;
        this.renderer.paletteDominance = values[nextIndex];
        console.log(`🎨 Palette Dominance: ${this.renderer.paletteDominance} (higher = purer hues, less pixel soup)`);
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
        
        // Handle continuous injection (throttled)
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
            // Throttle to every N frames to avoid overwhelming flow
            if ((this._injectionFrameCount % this.injectEveryN) === 1) {
                const isInk = this.currentMaterialIndex === 0;
                if (isInk) {
                    // Paint ink into water layer
                    this.simulation.splat(x, y, this.currentColor, 0.08);
                } else if (this.simulation.useOil && this.simulation.oil) {
                    // Paint oil only (no additional ink), using current color as oil tint
                    const oilRadius = 0.06;
                    this.simulation.oil.splatColor(x, y, this.currentColor, oilRadius);
                }
            }
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
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === ' ') {
            if (e.preventDefault) e.preventDefault();
        }
        // Container rotation controls (increased to 0.2 for better visibility)
        if (e.key === 'ArrowLeft' || e.key === 'a') {
            this.simulation.setRotationDelta(0.2);
            console.log('Rotating counter-clockwise: 0.2');
        } else if (e.key === 'ArrowRight' || e.key === 'd') {
            this.simulation.setRotationDelta(-0.2);
            console.log('Rotating clockwise: -0.2');
        } else if (e.key === 'ArrowUp') {
            this.simulation.setRotationDelta(0.2);
        } else if (e.key === 'ArrowDown') {
            this.simulation.setRotationDelta(-0.2);
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

        // Materials via number keys 1-5
        else if (['1','2','3','4','5'].includes(e.key)) {
            const idx = parseInt(e.key, 10) - 1;
            this.setMaterial(idx, true);
            this.updateMenuStates();
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

        // Marangoni live tuning
        else if (e.key === '[') {
            this.simulation.marangoniStrength = Math.max(0.0, this.simulation.marangoniStrength - 0.05);
            console.log(`Marangoni Strength: ${this.simulation.marangoniStrength.toFixed(2)}`);
            this.updateMarangoniHUD();
        }
        else if (e.key === ']') {
            this.simulation.marangoniStrength = Math.min(2.0, this.simulation.marangoniStrength + 0.05);
            console.log(`Marangoni Strength: ${this.simulation.marangoniStrength.toFixed(2)}`);
            this.updateMarangoniHUD();
        }
        else if (e.key === ';') {
            this.simulation.marangoniKth = Math.max(-2.0, this.simulation.marangoniKth - 0.05);
            console.log(`Marangoni k_th: ${this.simulation.marangoniKth.toFixed(2)}`);
            this.updateMarangoniHUD();
        }
        else if (e.key === "'") {
            this.simulation.marangoniKth = Math.min(3.0, this.simulation.marangoniKth + 0.05);
            console.log(`Marangoni k_th: ${this.simulation.marangoniKth.toFixed(2)}`);
            this.updateMarangoniHUD();
        }
        else if (e.key === ',') {
            this.simulation.marangoniEdgeBand = Math.max(0.0, this.simulation.marangoniEdgeBand - 0.25);
            console.log(`Marangoni Edge Band: ${this.simulation.marangoniEdgeBand.toFixed(2)} px`);
            this.updateMarangoniHUD();
        }
        else if (e.key === '.') {
            this.simulation.marangoniEdgeBand = Math.min(10.0, this.simulation.marangoniEdgeBand + 0.25);
            console.log(`Marangoni Edge Band: ${this.simulation.marangoniEdgeBand.toFixed(2)} px`);
            this.updateMarangoniHUD();
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
            this.simulation.setRotationDelta(0.0);
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

        // If second finger is down, engage jet mode (right-click equivalent)
        if (e.touches.length === 2) {
            if (!this.isRightMouseDown) {
                this.isRightMouseDown = true;
                this.didJetThisClick = false;
                this.lastJetTime = 0;
                this.jetHoldStart = performance.now();
            }
        } else if (e.touches.length === 1) {
            // Single touch = paint mode
            this.isRightMouseDown = false;
            this.isMouseDown = true;
        }
    }

    onTouchEnd(e) {
        e.preventDefault();
        const remaining = e.touches.length;
        if (remaining === 0) {
            this.isMouseDown = false;
            this.isRightMouseDown = false;
        } else if (remaining === 1) {
            // Revert to paint mode with remaining finger
            this.isRightMouseDown = false;
            this.isMouseDown = true;
            const t = e.touches[0];
            const rect = this.gl.canvas.getBoundingClientRect();
            this.currentMouseX = (t.clientX - rect.left) / rect.width;
            this.currentMouseY = 1.0 - (t.clientY - rect.top) / rect.height;
        }
    }

    

onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || 
        e.key === 'ArrowRight' || e.key === 'd' ||
        e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        this.simulation.setRotationDelta(0.0);
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
