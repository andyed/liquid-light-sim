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
        
        // Create intermediate texture for boundary rendering
        this.createBoundaryTexture();
        
        this.ready = true;
        console.log('✓ Renderer initialized');
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
        gl.bindTexture(gl.TEXTURE_2D, simulation.colorTexture1);
        let textureUniform = gl.getUniformLocation(this.passThroughProgram, 'u_texture');
        gl.uniform1i(textureUniform, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Step 2: Render with circular boundary overlay to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.useProgram(this.boundaryProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        positionAttrib = gl.getAttribLocation(this.boundaryProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.boundaryTexture);
        textureUniform = gl.getUniformLocation(this.boundaryProgram, 'u_texture');
        gl.uniform1i(textureUniform, 0);
        
        // Set boundary parameters
        const centerUniform = gl.getUniformLocation(this.boundaryProgram, 'u_center');
        gl.uniform2f(centerUniform, 0.5, 0.5);
        
        const radiusUniform = gl.getUniformLocation(this.boundaryProgram, 'u_radius');
        gl.uniform1f(radiusUniform, 0.48);
        
        const thicknessUniform = gl.getUniformLocation(this.boundaryProgram, 'u_thickness');
        gl.uniform1f(thicknessUniform, 0.005);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}