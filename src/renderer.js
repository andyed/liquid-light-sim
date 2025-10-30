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

        this.backgroundColor = { r: 0.0, g: 0.0, b: 0.0 };
        this.debugMode = 0; // 0=color, 1=velocity, 2=concentration gradient
        this.useVolumetric = true; // Beer-Lambert volumetric rendering
        this.absorptionCoefficient = 3.0; // Higher = more saturated glow
        this.usePostProcessing = true; // Organic flow distortion (O key to toggle)
        this.distortionStrength = 0.35; // 0.0-1.0, higher = more organic
        this.smoothingStrength = 0.6; // 0.0-1.0, bilateral blur strength
        this.paletteDominance = 0.2; // 0.0-1.0, winner-takes-all strength
        this.paletteSoftPower = 3.0; // softmax power; lower = softer, higher = snappier

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.quadBuffer = this.createQuad();
        this.init();
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
        
        // Create intermediate texture for boundary rendering
        this.createBoundaryTexture();
        
        // Create intermediate texture for post-processing
        this.createPostProcessTexture();
        
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
        this.gl.canvas.width = window.innerWidth;
        this.gl.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
        
        // Recreate boundary texture with new size
        if (this.ready) {
            this.createBoundaryTexture();
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
        this.debugMode = (this.debugMode + 1) % 3;
        const modes = ['🎨 COLOR', '🔍 VELOCITY', '🌊 CONCENTRATION GRADIENT'];
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
        gl.uniform1f(radiusUniform, 0.48);
        
        const thicknessUniform = gl.getUniformLocation(this.boundaryProgram, 'u_thickness');
        gl.uniform1f(thicknessUniform, 0.005);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}