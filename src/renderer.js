import { loadShader } from './utils.js';

export default class Renderer {
    constructor() {
        const canvas = document.getElementById('gl-canvas');
        this.gl = canvas.getContext('webgl2');
        if (!this.gl) {
            throw new Error('WebGL 2 not supported');
        }

        // Enable float texture extension (required for FBO rendering)
        const ext = this.gl.getExtension('EXT_color_buffer_float');
        if (!ext) {
            throw new Error('EXT_color_buffer_float not supported - float textures cannot be used as render targets');
        }
        console.log('✓ Float texture extension enabled');

        this.backgroundColor = { r: 1.0, g: 0.35, b: 0.15 };
        this.debugMode = 0; // 0=color, 1=velocity, 2=concentration gradient, 3=oil thickness, 4=oil gradient, 5=occ split
        this.useVolumetric = true; // Beer-Lambert volumetric rendering
        this.absorptionCoefficient = 0.8; // Lower = more vibrant centers (reverted)
        this.usePostProcessing = true; // Organic flow distortion (O key to toggle)
        this.distortionStrength = 0.4; // 0.0-1.0, tuned to break severe banding artifacts
        this.smoothingStrength = 0.5; // 0.0-1.0, bilateral blur strength
        this.paletteDominance = 0.3; // 0.0-1.0, winner-takes-all strength
        this.paletteSoftPower = 3.0; // softmax power; lower = softer, higher = snappier
        // Oil composite defaults - enhanced for realistic appearance
        this.oilRefractStrength = 0.025; // screen-UV scale (increased for visible distortion)
        this.oilFresnelPower = 2.5; // lower = more reflection at grazing angles
        this.oilOcclusion = 0.25; // 0..1 (increased for variable density)
        this.oilAlphaGamma = 1.2; // gamma for thickness→alpha (sharper transitions)
        this.oilTintStrength = 0.9; // 0..1, how much oil color tints scene (high to preserve user color)
        this.brightnessGain = 1.5; // Increased for more vibrant ink

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.quadBuffer = this.createQuad();
        this.init();
    }

    setSimulation(simulation) {
        this.simulation = simulation;
    }

    async init() {
        const passThroughVert = await loadShader('src/shaders/fullscreen.vert.glsl');
        const passThroughFrag = await loadShader('src/shaders/passThrough.frag.glsl');
        this.passThroughProgram = this.createProgram(passThroughVert, passThroughFrag);
        
        // Load boundary shader for circular container visualization
        const boundaryFrag = await loadShader('src/shaders/boundary.frag.glsl');
        this.boundaryProgram = this.createProgram(passThroughVert, boundaryFrag);
        
        // Load concentration debug shader
        const debugConcentrationFrag = await loadShader('src/shaders/debug-concentration.frag.glsl');
        this.debugConcentrationProgram = this.createProgram(passThroughVert, debugConcentrationFrag);
        
        // Load velocity debug shader (HSV: angle->hue, magnitude->value)
        const debugVelocityFrag = await loadShader('src/shaders/debug-velocity.frag.glsl');
        this.debugVelocityProgram = this.createProgram(passThroughVert, debugVelocityFrag);
        
        // Load volumetric rendering shader (Beer-Lambert absorption)
        const volumetricFrag = await loadShader('src/shaders/volumetric.frag.glsl');
        this.volumetricProgram = this.createProgram(passThroughVert, volumetricFrag);
        
        // Load post-processing shader (organic flow distortion)
        const postProcessFrag = await loadShader('src/shaders/post-process.frag.glsl');
        this.postProcessProgram = this.createProgram(passThroughVert, postProcessFrag);

        // Oil debug shaders
        const debugOilThickFrag = await loadShader('src/shaders/debug-oil-thickness.frag.glsl');
        this.debugOilThicknessProgram = this.createProgram(passThroughVert, debugOilThickFrag);
        const debugOilGradFrag = await loadShader('src/shaders/debug-oil-gradient.frag.glsl');
        this.debugOilGradientProgram = this.createProgram(passThroughVert, debugOilGradFrag);
        const debugOccSplitFrag = await loadShader('src/shaders/debug-occupancy-split.frag.glsl');
        this.debugOccupancySplitProgram = this.createProgram(passThroughVert, debugOccSplitFrag);

        // Load oil composite shader (adds lensy oil contribution over scene)
        const oilCompositeFrag = await loadShader('src/shaders/oil-composite.frag.glsl');
        this.oilCompositeProgram = this.createProgram(passThroughVert, oilCompositeFrag);
        
        // Create intermediate texture for boundary rendering
        this.createBoundaryTexture();
        
        // Create intermediate texture for post-processing
        this.createPostProcessTexture();

        // Create intermediate texture for oil compositing
        this.createOilCompositeTexture();
        
        this.ready = true;
        console.log('✓ Renderer initialized');
    }
    
    createPostProcessTexture() {
        const gl = this.gl;
        const width = gl.canvas.width;
        const height = gl.canvas.height;
        
        this.postProcessTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.postProcessTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        this.postProcessFBO = gl.createFramebuffer();
    }

    createOilCompositeTexture() {
        const gl = this.gl;
        const width = gl.canvas.width;
        const height = gl.canvas.height;
        
        this.oilCompositeTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.oilCompositeTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        this.oilCompositeFBO = gl.createFramebuffer();
    }
    
    createBoundaryTexture() {
        const gl = this.gl;
        const width = gl.canvas.width;
        const height = gl.canvas.height;
        
        this.boundaryTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.boundaryTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        this.boundaryFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.boundaryFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.boundaryTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    resize() {
        const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
        const viewportWidth = Math.max(1, window.innerWidth);
        const viewportHeight = Math.max(1, window.innerHeight);

        // ALWAYS SQUARE: Canvas is inside circular border container
        // Use smallest viewport dimension to ensure it fits
        const squareSize = Math.min(viewportWidth, viewportHeight);
        const cssW = squareSize;
        const cssH = squareSize;

        // Apply CSS size (but CSS has 100% with circular-border parent, so this is backup)
        const canvasEl = this.gl.canvas;
        canvasEl.style.width = cssW + 'px';
        canvasEl.style.height = cssH + 'px';

        // Compute SQUARE drawing buffer size in device pixels
        const maxTex = this._maxTextureSize || (this._maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));
        const targetSize = Math.min(maxTex, Math.max(1, Math.floor(squareSize * dpr)));

        // Set drawing buffer to SQUARE (critical for circular display)
        this.gl.canvas.width = targetSize;
        this.gl.canvas.height = targetSize;

        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

        // Recreate intermediate textures only if size changed
        const w = this.gl.canvas.width;
        const h = this.gl.canvas.height;
        const changed = (this._lastCanvasW !== w) || (this._lastCanvasH !== h);
        if (changed) {
            this._lastCanvasW = w;
            this._lastCanvasH = h;
            if (this.ready) {
                this.createBoundaryTexture();
                this.createPostProcessTexture();
                this.createOilCompositeTexture();
                if (this.simulation && this.simulation.ready) {
                    this.simulation.recreateTextures();
                }
            }
        }
    }

    createQuad() {
        const gl = this.gl;
        const vertices = new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1,
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        return buffer;
    }

    createProgram(vertexShaderSource, fragmentShaderSource) {
        const gl = this.gl;
        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Failed to link program:', gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(`Failed to compile ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader:`, gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    setBackgroundColor(color) {
        this.backgroundColor = color;
    }
    
    toggleDebugMode() {
        this.debugMode = (this.debugMode + 1) % 6;
        const modes = ['🎨 COLOR', '🔍 VELOCITY', '🌊 CONCENTRATION GRADIENT', '🛢️ OIL THICKNESS', '🧭 OIL GRADIENT', '📊 OCCUPANCY SPLIT'];
        console.log(`Debug mode: ${modes[this.debugMode]}`);
    }

    render(simulation) {
        if (!this.ready || !simulation.ready) return;

        const gl = this.gl;
        
        // Step 1: Render simulation color to intermediate texture
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.boundaryFBO);
        gl.clearColor(this.backgroundColor.r, this.backgroundColor.g, this.backgroundColor.b, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.passThroughProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        let positionAttrib = gl.getAttribLocation(this.passThroughProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        
        if (this.debugMode === 2) {
            // Concentration gradient debug mode
            gl.useProgram(this.debugConcentrationProgram);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            positionAttrib = gl.getAttribLocation(this.debugConcentrationProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);
            
            gl.bindTexture(gl.TEXTURE_2D, simulation.colorTexture1);
            let textureUniform = gl.getUniformLocation(this.debugConcentrationProgram, 'u_color_texture');
            gl.uniform1i(textureUniform, 0);
        } else if (this.debugMode === 1) {
            // Velocity visualization mode (HSV)
            gl.useProgram(this.debugVelocityProgram);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            positionAttrib = gl.getAttribLocation(this.debugVelocityProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

            gl.bindTexture(gl.TEXTURE_2D, simulation.velocityTexture1);
            gl.uniform1i(gl.getUniformLocation(this.debugVelocityProgram, 'u_velocity_texture'), 0);
            gl.uniform1f(gl.getUniformLocation(this.debugVelocityProgram, 'u_scale'), 3.0);
        } else if (this.debugMode === 3 && this.simulation.useOil && this.simulation.oil) {
            // Oil thickness view
            gl.useProgram(this.debugOilThicknessProgram);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            positionAttrib = gl.getAttribLocation(this.debugOilThicknessProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

            gl.bindTexture(gl.TEXTURE_2D, this.simulation.oil.oilTexture1);
            gl.uniform1i(gl.getUniformLocation(this.debugOilThicknessProgram, 'u_oil_texture'), 0);
        } else if (this.debugMode === 4 && this.simulation.useOil && this.simulation.oil) {
            // Oil gradient magnitude view
            gl.useProgram(this.debugOilGradientProgram);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            positionAttrib = gl.getAttribLocation(this.debugOilGradientProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

            gl.bindTexture(gl.TEXTURE_2D, this.simulation.oil.oilTexture1);
            gl.uniform1i(gl.getUniformLocation(this.debugOilGradientProgram, 'u_oil_texture'), 0);
            gl.uniform2f(gl.getUniformLocation(this.debugOilGradientProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        } else if (this.debugMode === 5 && this.simulation.useOil && this.simulation.oil) {
            // Split occupancy: left water ink occupancy (thresholded), right oil thickness
            gl.useProgram(this.debugOccupancySplitProgram);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            positionAttrib = gl.getAttribLocation(this.debugOccupancySplitProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, simulation.colorTexture1);
            gl.uniform1i(gl.getUniformLocation(this.debugOccupancySplitProgram, 'u_water_color'), 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.simulation.oil.oilTexture1);
            gl.uniform1i(gl.getUniformLocation(this.debugOccupancySplitProgram, 'u_oil_texture'), 1);
            gl.uniform1f(gl.getUniformLocation(this.debugOccupancySplitProgram, 'u_thresh'), 0.02);
        } else if (this.debugMode === 0 && this.useVolumetric) {
            // Volumetric rendering mode (Beer-Lambert absorption)
            gl.useProgram(this.volumetricProgram);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            positionAttrib = gl.getAttribLocation(this.volumetricProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);
            
            gl.bindTexture(gl.TEXTURE_2D, simulation.colorTexture1);
            let textureUniform = gl.getUniformLocation(this.volumetricProgram, 'u_color_texture');
            gl.uniform1i(textureUniform, 0);
            gl.uniform1f(gl.getUniformLocation(this.volumetricProgram, 'u_absorption_coefficient'), this.absorptionCoefficient);
            gl.uniform1f(gl.getUniformLocation(this.volumetricProgram, 'u_brightness_gain'), this.brightnessGain);
            gl.uniform3f(gl.getUniformLocation(this.volumetricProgram, 'u_light_color'), 
                this.backgroundColor.r, this.backgroundColor.g, this.backgroundColor.b);
        } else {
            // Simple color or velocity mode
            gl.bindTexture(gl.TEXTURE_2D, simulation.colorTexture1);
            let textureUniform = gl.getUniformLocation(this.passThroughProgram, 'u_texture');
            gl.uniform1i(textureUniform, 0);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Step 2: Optional post-processing (organic flow distortion)
        let sourceTexture = this.boundaryTexture;
        
        if (this.usePostProcessing) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.postProcessFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.postProcessTexture, 0);
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            gl.useProgram(this.postProcessProgram);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            positionAttrib = gl.getAttribLocation(this.postProcessProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.boundaryTexture);
            gl.uniform1i(gl.getUniformLocation(this.postProcessProgram, 'u_texture'), 0);
            gl.uniform1f(gl.getUniformLocation(this.postProcessProgram, 'u_time'), performance.now() / 1000.0);
            gl.uniform2f(gl.getUniformLocation(this.postProcessProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
            gl.uniform1f(gl.getUniformLocation(this.postProcessProgram, 'u_distortionStrength'), this.distortionStrength);
            gl.uniform1f(gl.getUniformLocation(this.postProcessProgram, 'u_smoothingStrength'), this.smoothingStrength);
            gl.uniform1f(gl.getUniformLocation(this.postProcessProgram, 'u_paletteDominance'), this.paletteDominance);
            gl.uniform1f(gl.getUniformLocation(this.postProcessProgram, 'u_paletteSoftPower'), this.paletteSoftPower);
            
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            
            sourceTexture = this.postProcessTexture;
        }
        
        // Step 2.5: Oil composite (if enabled)
        if (this.simulation.useOil && this.simulation.oil && this.oilCompositeProgram) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilCompositeFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilCompositeTexture, 0);
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.useProgram(this.oilCompositeProgram);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            positionAttrib = gl.getAttribLocation(this.oilCompositeProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
            gl.uniform1i(gl.getUniformLocation(this.oilCompositeProgram, 'u_scene'), 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.simulation.oil.oilTexture1);
            gl.uniform1i(gl.getUniformLocation(this.oilCompositeProgram, 'u_oil_texture'), 1);

            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this.simulation.oil.curvatureTexture);
            gl.uniform1i(gl.getUniformLocation(this.oilCompositeProgram, 'u_curvature_texture'), 2);

            // Set composite uniforms
            gl.uniform2f(gl.getUniformLocation(this.oilCompositeProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
            gl.uniform1f(gl.getUniformLocation(this.oilCompositeProgram, 'u_refract_strength'), this.oilRefractStrength);
            gl.uniform1f(gl.getUniformLocation(this.oilCompositeProgram, 'u_fresnel_power'), this.oilFresnelPower);
            gl.uniform1f(gl.getUniformLocation(this.oilCompositeProgram, 'u_occlusion'), this.oilOcclusion);
            gl.uniform1f(gl.getUniformLocation(this.oilCompositeProgram, 'u_oil_gamma'), this.oilAlphaGamma);
            gl.uniform1f(gl.getUniformLocation(this.oilCompositeProgram, 'u_tint_strength'), this.oilTintStrength);

            // Set material-specific iridescence
            let iridescence = 0.0;
            const matName = this.simulation.controller?.materials[this.simulation.controller.currentMaterialIndex]?.name || '';

            if (matName === 'Mineral Oil') {
                iridescence = 0.1;
            } else if (matName === 'Syrup') {
                iridescence = 0.0; // Syrup is not iridescent
            } else if (matName === 'Glycerine') {
                iridescence = 0.2; // Glycerine can have some sheen
            } else if (matName === 'Ink') {
                iridescence = 0.3; // Ink can have a colorful, pearlescent sheen
            }
            gl.uniform1f(gl.getUniformLocation(this.oilCompositeProgram, 'u_iridescence_strength'), iridescence);

            gl.drawArrays(gl.TRIANGLES, 0, 6);

            // After compositing, the source becomes oilCompositeTexture
            sourceTexture = this.oilCompositeTexture;
        }
        
        // Step 3: Render with circular boundary overlay to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.useProgram(this.boundaryProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        positionAttrib = gl.getAttribLocation(this.boundaryProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
        let boundaryTextureUniform = gl.getUniformLocation(this.boundaryProgram, 'u_texture');
        gl.uniform1i(boundaryTextureUniform, 0);
        
        // Set boundary parameters
        const resUniform = gl.getUniformLocation(this.boundaryProgram, 'u_resolution');
        gl.uniform2f(resUniform, gl.canvas.width, gl.canvas.height);
        const centerUniform = gl.getUniformLocation(this.boundaryProgram, 'u_center');
        gl.uniform2f(centerUniform, 0.5, 0.5);
        
        const radiusUniform = gl.getUniformLocation(this.boundaryProgram, 'u_radius');
        // Smaller radius on mobile to prevent right-edge cropping
        const isMobile = window.innerWidth <= 768;
        const radius = isMobile ? 0.47 : 0.48;
        gl.uniform1f(radiusUniform, radius);
        
        const thicknessUniform = gl.getUniformLocation(this.boundaryProgram, 'u_thickness');
        gl.uniform1f(thicknessUniform, 0.005);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}