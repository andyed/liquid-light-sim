// src/simulation/sph/webgpu-sph-render.js
// WebGPU particle rendering pipeline - renders directly from compute buffer

import { loadShader } from '../../utils.js';

class WebGPUSPHRender {
    constructor(device, webgpuSPH, width, height) {
        this.device = device;
        this.webgpuSPH = webgpuSPH;
        this.width = width;
        this.height = height;

        this.pipeline = null;
        this.bindGroup = null;
        this.uniformBuffer = null;
        this.renderTexture = null;
        this.renderTextureView = null;

        // Create uniform buffer (resolution, containerRadius, spriteRadius, particleCount)
        this.uniformBuffer = this.device.createBuffer({
            size: 32, // 2 floats + 2 floats + 1 u32 + 3 u32 padding = 8 * 4 = 32 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'SPH Render Uniforms',
        });

        // Create render target texture
        this.createRenderTexture(width, height);
    }

    createRenderTexture(width, height) {
        this.width = width;
        this.height = height;

        // Destroy old texture if exists
        if (this.renderTexture) {
            this.renderTexture.destroy();
        }

        this.renderTexture = this.device.createTexture({
            size: [width, height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
            label: 'SPH Render Texture',
        });

        this.renderTextureView = this.renderTexture.createView();
        console.log(`✅ WebGPU SPH render texture created: ${width}x${height}`);
    }

    async init() {
        const shaderCode = await loadShader('src/shaders/webgpu/sph-render.wgsl');
        const shaderModule = this.device.createShaderModule({ 
            code: shaderCode,
            label: 'SPH Render Shader',
        });

        // Bind group layout
        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'read-only-storage' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' },
                },
            ],
            label: 'SPH Render Bind Group Layout',
        });

        // Create bind group
        this.bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.webgpuSPH.particleBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.uniformBuffer },
                },
            ],
            label: 'SPH Render Bind Group',
        });

        // Pipeline layout
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
            label: 'SPH Render Pipeline Layout',
        });

        // Create render pipeline
        this.pipeline = await this.device.createRenderPipelineAsync({
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: 'rgba8unorm',
                    blend: {
                        // Pre-multiplied alpha blending
                        color: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                    },
                }],
            },
            primitive: {
                topology: 'triangle-list',
            },
            label: 'SPH Render Pipeline',
        });

        console.log('✅ WebGPU SPH render pipeline created.');
    }

    /**
     * Render particles to texture.
     * @param {number} containerRadius - Container radius for coordinate conversion
     * @param {number} spriteRadius - Particle sprite radius in pixels
     */
    render(containerRadius, spriteRadius) {
        if (!this.pipeline || !this.bindGroup) {
            return;
        }

        const particleCount = this.webgpuSPH.particleCount;
        if (particleCount === 0) {
            // Clear texture
            const commandEncoder = this.device.createCommandEncoder();
            const passEncoder = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.renderTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            passEncoder.end();
            this.device.queue.submit([commandEncoder.finish()]);
            return;
        }

        // Update uniforms
        const uniforms = new ArrayBuffer(32);
        const floatView = new Float32Array(uniforms);
        const uintView = new Uint32Array(uniforms);
        
        floatView[0] = this.width;           // resolution.x
        floatView[1] = this.height;          // resolution.y
        floatView[2] = containerRadius;      // containerRadius
        floatView[3] = spriteRadius;         // particleSpriteRadius
        uintView[4] = particleCount;         // particleCount
        // [5], [6], [7] are padding

        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

        // Render
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.renderTextureView,
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });

        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        
        // Draw 6 vertices per particle (2 triangles = 1 quad)
        passEncoder.draw(6, particleCount, 0, 0);

        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Get the render texture for reading.
     */
    getTexture() {
        return this.renderTexture;
    }

    /**
     * Resize render texture.
     */
    resize(width, height) {
        if (width !== this.width || height !== this.height) {
            this.createRenderTexture(width, height);
        }
    }

    /**
     * Copy render texture to a staging buffer for WebGL interop.
     * Returns a promise that resolves to pixel data.
     * NOTE: This uses readback - only call infrequently for debugging!
     */
    async readPixels() {
        const bytesPerRow = Math.ceil(this.width * 4 / 256) * 256; // Align to 256
        const bufferSize = bytesPerRow * this.height;

        const stagingBuffer = this.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyTextureToBuffer(
            { texture: this.renderTexture },
            { buffer: stagingBuffer, bytesPerRow },
            [this.width, this.height]
        );
        this.device.queue.submit([commandEncoder.finish()]);

        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const data = new Uint8Array(stagingBuffer.getMappedRange()).slice();
        stagingBuffer.unmap();
        stagingBuffer.destroy();

        return data;
    }
}

export default WebGPUSPHRender;
