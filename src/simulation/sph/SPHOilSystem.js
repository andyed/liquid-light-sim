/**
 * SPHOilSystem.js
 * 
 * Main SPH (Smoothed Particle Hydrodynamics) controller for oil simulation
 * Replaces grid-based oil layer with particle-based Lagrangian simulation
 * 
 * Key Features:
 * - Implicit surface tension (high σ without instability)
 * - Natural topology changes (merging/splitting)
 * - GPU-accelerated compute
 * - O(N log N) neighbor search via spatial hashing
 */

import SpatialHashGrid from './SpatialHashGrid.js';
import ImplicitSolver from './ImplicitSolver.js';
import { clamp } from '../../utils.js';

export default class SPHOilSystem {
  constructor(maxParticles = 50000, containerRadius = 0.48, sphParticleSplatVertWGSL, sphParticleSplatFragWGSL) {
    this.maxParticles = maxParticles;
    this.containerRadius = containerRadius;
    
    // SPH parameters (will be tuned per material)
    this.smoothingRadius = 0.14;      // Larger h for broader neighbor overlap (sheet formation)
    this.restDensity = 1000.0;        // Rest density (ρ₀)
    this.particleMass = 0.02;         // Mass per particle
    this.viscosity = 0.08;            // Slightly higher to maintain ribbons/filaments
    this.surfaceTension = 50.0;       // DRASTICALLY REDUCED from 3000 - was causing NaN (was insane!)
    this.gravity = -0.01;             // EXTREMELY WEAK: Prevent spreading (was -0.1)
    this.dt = 1/60;                   // Timestep
    
    // Temperature parameters
    this.thermalExpansion = 0.001;    // α for ρ(T) = ρ₀(1 - α(T - T₀))
    this.thermalConductivity = 0.1;   // Heat diffusion rate
    this.roomTemperature = 20.0;      // Celsius
    this.marangoniStrength = 5.0;     // Strength of surface tension gradient force
    
    // Particle data (Structure of Arrays for cache efficiency)
    // Each particle: [x, y, vx, vy, density, pressure, temperature, phase]
    this.particleCount = 0;
    this.positions = new Float32Array(maxParticles * 2);      // [x, y]
    this.velocities = new Float32Array(maxParticles * 2);     // [vx, vy]
    this.forces = new Float32Array(maxParticles * 2);         // [fx, fy] accumulated
    this.densities = new Float32Array(maxParticles);          // ρ
    this.pressures = new Float32Array(maxParticles);          // p
    this.temperatures = new Float32Array(maxParticles);       // T (Celsius)
    this.nextTemperatures = new Float32Array(maxParticles); // Temp buffer for update
    this.phases = new Uint8Array(maxParticles);               // 0=water, 1=oil
    this.colors = new Float32Array(maxParticles * 3);         // [r, g, b]
    
    // Spatial hashing for O(N log N) neighbor queries
    this.spatialHash = new SpatialHashGrid(
      this.smoothingRadius * 2,  // Cell size = 2h
      containerRadius
    );
    
    // Neighbor cache (reused each frame)
    this.neighborLists = Array.from({ length: maxParticles }, () => []);
    
    // Implicit solver (Phase 2) - DISABLED due to instability
    // Matrix becomes ill-conditioned (16M non-zeros), residual explodes
    // Causes "dancing" particles instead of smooth flow
    this.useImplicitIntegration = false;
    this.implicitSolver = null; // Not used in explicit mode
    
    // GPU resources (to be initialized)
    this.gl = null;
    this.particleVBO = null;        // Vertex buffer for particle positions
    this.particleColorVBO = null;   // Vertex buffer for particle colors
    this.particleDensityVBO = null; // Vertex buffer for particle densities
    this.splatProgram = null;       // Shader program for particle rendering

    // WebGPU resources
    this.webgpuDevice = null;
    this.webgpuRenderPipeline = null;
    this.sphParticleSplatVertWGSL = sphParticleSplatVertWGSL;
    this.sphParticleSplatFragWGSL = sphParticleSplatFragWGSL;
    this.webgpuParticleBuffer = null; // GPUBuffer for particle data
    this.webgpuBindGroup = null;      // Bind group for particle buffer
    
    this.computeShaders = null;
    
    // Performance stats
    this.stats = {
      updateTime: 0,
      neighborTime: 0,
      forceTime: 0,
      integrateTime: 0,
      renderTime: 0
    };
    // Perf and debugging
    this.frameIndex = 0;
    this.debug = false;

    // Tunable cohesion and spawn parameters (material presets can override)
    this.shortCohesion = 4.0;   // Softer short-range cohesion (was 6.5)
    this.shortRadiusScale = 1.5; // REDUCED from 2.0: shortRadius = h * shortRadiusScale (prevents cross-blob attraction)
    this.minDistScale = 0.35;    // minDist = h * minDistScale
    this.longCohesion = 0.0;    // DISABLED: Long-range cohesion causes distant blobs to merge
    this.longRadiusScale = 4.0;  // longRadius = h * longRadiusScale (not used when longCohesion=0)
    this.spawnSpeedScale = 1.0;  // multiply base spawn speed
    this.gridDragCoeff = 1.3;    // coupling to grid velocities
    this.maxSpeedCap = 0.6;      // cap for |v| in _updatePositions
    this.xsphCoeff = 0.0;        // XSPH velocity smoothing (0 disables)
    this.particleSpriteRadius = 90.0; // point sprite radius in pixels (rendering)
    this.dampingFactor = 0.94;   // per-material velocity damping in _updatePositions
    this.forceClampMax = 4.0;    // per-particle |F| clamp (tighter default)
    this.quadraticDampingK = 2.0; // v *= 1/(1 + k*|v|) before linear damping (tighter default)
    // Universal positional cohesion (PBD-style)
    this.enablePositionalCohesion = true;
    this.posCohesionCoeff = 0.12; // 0..1 blend toward local centroid
    this.maxPosNudge = 0.004;     // as fraction of containerRadius per frame
    this.posCohesionRadiusScale = 1.0; // radius in units of h for positional cohesion neighborhood
    // Neighbor-aware drag (scale grid drag by local density)
    this.enableNeighborScaledDrag = true;
    this.neighborDragNMin = 3;
    this.neighborDragNMax = 10;
    // Positional cohesion boost after spawn
    this.posCohesionBoostFrames = 0;
    this.posCohesionBoostCoeff = 0.35; // stronger temporary pull (increased for faster congealing)
    this.posCohesionBoostIters = 3;    // extra iterations per frame during boost (increased)

    // Buffers for auxiliary accumulations
    this.xsphCorr = new Float32Array(maxParticles * 2);
    
    // === BLOB THINNING & SPLITTING PARAMETERS ===
    this.enableThinning = true;              // Enable thinning detection
    this.enableSplitting = true;             // Enable automatic blob splitting
    this.thinningThreshold = 0.6;            // Density ratio below which region is "thin" (0-1)
    this.neckDetectionRadius = 1.5;          // Multiplier of h for neck detection
    this.minNeighborsForThick = 8;          // Minimum neighbors to be considered "thick"
    this.cohesionReductionInThin = 0.2;     // Reduce cohesion to 20% in thin regions
    this.splitDistance = 2.0;                // Split when clusters are > 2.0h apart (tighter to prevent merging)
    this.splitCheckInterval = 30;            // Check for splitting every N frames (performance)
    this.minClusterSize = 3;                // Minimum particles to form a valid blob cluster
  }

  /**
   * Positional cohesion: move particles slightly toward local centroid (PBD-style)
   * Applied after velocity integration; adjusts velocity to reflect displacement.
   */
  applyPositionalCohesion(dt, coeffOverride) {
    const h = this.smoothingRadius * this.shortRadiusScale; // short-range neighborhood
    const maxNudge = this.maxPosNudge * this.containerRadius;
    const coeff = (typeof coeffOverride === 'number') ? coeffOverride : this.posCohesionCoeff;
    if (coeff <= 0) return;
    
    // Maximum distance for positional cohesion - prevents cross-blob attraction
    // Use dedicated positional radius scale so this stays local per material
    const maxCohesionDist = this.smoothingRadius * this.posCohesionRadiusScale;
    
    for (let i = 0; i < this.particleCount; i++) {
      const xi = this.positions[i * 2];
      const yi = this.positions[i * 2 + 1];
      const neighbors = this.spatialHash.query(xi, yi, h);
      if (neighbors.length <= 1) continue; // isolated
      
      // Compute centroid (include self) - but only count neighbors within maxCohesionDist
      let cx = 0, cy = 0, count = 0;
      for (const j of neighbors) {
        const xj = this.positions[j * 2];
        const yj = this.positions[j * 2 + 1];
        const dx = xi - xj;
        const dy = yi - yj;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Only include neighbors within maxCohesionDist (prevents cross-blob attraction)
        if (dist <= maxCohesionDist) {
          cx += xj;
          cy += yj;
          count++;
        }
      }
      if (count <= 1) continue; // No valid neighbors after distance filtering
      cx /= count; cy /= count;
      let dx = (cx - xi) * coeff;
      let dy = (cy - yi) * coeff;
      const mag = Math.hypot(dx, dy);
      if (mag > maxNudge && mag > 0) {
        const s = maxNudge / mag;
        dx *= s; dy *= s;
      }
      if (mag > 0) {
        // Apply position correction
        this.positions[i * 2] = xi + dx;
        this.positions[i * 2 + 1] = yi + dy;
        // Adjust velocity to be consistent with correction
        const invDt = dt > 0 ? (1.0 / dt) : 0.0;
        this.velocities[i * 2] += dx * invDt;
        this.velocities[i * 2 + 1] += dy * invDt;
      }
    }
  }
  
  /**
   * Initialize GPU resources
   */
  initGPU(gl, splatProgram) {
    this.gl = gl;
    this.splatProgram = splatProgram;
    
    // Create vertex buffers for particle data
    this.particleVBO = gl.createBuffer();
    this.particleColorVBO = gl.createBuffer();
    this.particleDensityVBO = gl.createBuffer();
    
    console.log('✅ SPH GPU buffers created');
  }

  /**
   * Initialize WebGPU resources for rendering
   */
  initWebGPU(device) {
    this.webgpuDevice = device;

    // Define the layout of the particle data in the storage buffer
    // This must match the Particle struct in sph-particle-splat.vert.wgsl
    // struct Particle {
    //     pos: vec2<f32>,
    //     vel: vec2<f32>,
    //     density: f32,
    //     color: vec4<f32>,
    // };
    // Total size: 2*4 + 2*4 + 1*4 + 4*4 = 8 + 8 + 4 + 16 = 36 bytes per particle
    const particleStride = 36; // bytes

    // Create the GPU buffer for particle data
    this.webgpuParticleBuffer = device.createBuffer({
      size: this.maxParticles * particleStride,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'SPH Particle Buffer',
    });

    // Create the render pipeline
    this.webgpuRenderPipeline = device.createRenderPipeline({
      label: 'SPH Particle Splat Render Pipeline',
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: this.sphParticleSplatVertWGSL,
          label: 'SPH Particle Splat Vertex Shader',
        }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({
          code: this.sphParticleSplatFragWGSL,
          label: 'SPH Particle Splat Fragment Shader',
        }),
        entryPoint: 'main',
        targets: [{
          format: 'rgba16float', // Assuming the target texture format is RGBA16F
          blend: {
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
        topology: 'triangle-strip', // We are drawing quads using triangle strips
      },
    });

    // Create the bind group for the particle buffer
    this.webgpuBindGroup = device.createBindGroup({
      layout: this.webgpuRenderPipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: {
          buffer: this.webgpuParticleBuffer,
        },
      }],
      label: 'SPH Particle Bind Group',
    });

    console.log('✅ SPH WebGPU render pipeline and buffers created');
  }
  
  /**
   * Upload particle data to GPU buffers
   */
  uploadToGPU() {
    if (!this.gl && !this.webgpuDevice || this.particleCount === 0) return;
    
    // WebGL2 upload (for fallback)
    if (this.gl) {
      const gl = this.gl;
      
      // Upload positions (only active particles)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVBO);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions.subarray(0, this.particleCount * 2), gl.DYNAMIC_DRAW);
      
      // Upload colors directly (no temperature encoding - it was overwriting colors!)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorVBO);
      gl.bufferData(gl.ARRAY_BUFFER, this.colors.subarray(0, this.particleCount * 3), gl.DYNAMIC_DRAW);
      
      // Upload densities
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleDensityVBO);
      gl.bufferData(gl.ARRAY_BUFFER, this.densities.subarray(0, this.particleCount), gl.DYNAMIC_DRAW);
    }

    // WebGPU upload
    if (this.webgpuDevice) {
      // Create interleaved data for WebGPU
      const interleavedData = new Float32Array(this.particleCount * 9); // 2 pos + 2 vel + 1 density + 4 color
      for (let i = 0; i < this.particleCount; i++) {
        const baseIdx = i * 9;
        // Position
        interleavedData[baseIdx] = this.positions[i * 2];
        interleavedData[baseIdx + 1] = this.positions[i * 2 + 1];
        // Velocity (placeholder for now, will be updated by compute shader)
        interleavedData[baseIdx + 2] = this.velocities[i * 2];
        interleavedData[baseIdx + 3] = this.velocities[i * 2 + 1];
        // Density
        interleavedData[baseIdx + 4] = this.densities[i];
        // Color (add alpha channel, assuming 1.0 for now)
        interleavedData[baseIdx + 5] = this.colors[i * 3];
        interleavedData[baseIdx + 6] = this.colors[i * 3 + 1];
        interleavedData[baseIdx + 7] = this.colors[i * 3 + 2];
        interleavedData[baseIdx + 8] = 1.0; // Alpha
      }

      this.webgpuDevice.queue.writeBuffer(
        this.webgpuParticleBuffer,
        0,
        interleavedData.buffer,
        interleavedData.byteOffset,
        interleavedData.byteLength
      );
    }
  }
  
  /**
   * Render particles to texture using point sprites
   * @param {WebGLFramebuffer} targetFBO - Framebuffer to render into
   * @param {number} canvasWidth - Canvas width
   * @param {number} canvasHeight - Canvas height
   */
  renderParticles(target, canvasWidth, canvasHeight) {
    if (this.webgpuRenderPipeline && this.webgpuDevice && target instanceof GPUTextureView) {
      // WebGPU rendering path
      this.uploadToGPU();
      const startTime = performance.now();
      const commandEncoder = this.webgpuDevice.createCommandEncoder();
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: target,
          loadOp: 'clear',
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          storeOp: 'store',
        }],
      });

      passEncoder.setPipeline(this.webgpuRenderPipeline);
      passEncoder.setBindGroup(0, this.webgpuBindGroup);
      passEncoder.draw(4, this.particleCount, 0, 0); // 4 vertices per quad, particleCount instances
      passEncoder.end();
      this.webgpuDevice.queue.submit([commandEncoder.finish()]);
      this.stats.renderTime = performance.now() - startTime;
      return;
    }

    // WebGL2 rendering path (fallback)
    if (!this.gl || !this.splatProgram || this.particleCount === 0) return;
    
    const startTime = performance.now();
    const gl = this.gl;
    
    // Upload latest particle data to GPU
    this.uploadToGPU();
    
    // Bind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    
    // Use particle splat shader
    gl.useProgram(this.splatProgram);
    
    // Set up vertex attributes
    const posLoc = gl.getAttribLocation(this.splatProgram, 'a_position');
    const colorLoc = gl.getAttribLocation(this.splatProgram, 'a_color');
    const densityLoc = gl.getAttribLocation(this.splatProgram, 'a_density');
    
    // Position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVBO);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    
    // Color attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorVBO);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
    
    // Density attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleDensityVBO);
    gl.enableVertexAttribArray(densityLoc);
    gl.vertexAttribPointer(densityLoc, 1, gl.FLOAT, false, 0, 0);
    
    // Set uniforms
    gl.uniform2f(gl.getUniformLocation(this.splatProgram, 'u_resolution'), canvasWidth, canvasHeight);
    gl.uniform1f(gl.getUniformLocation(this.splatProgram, 'u_containerRadius'), this.containerRadius);
    gl.uniform1f(gl.getUniformLocation(this.splatProgram, 'u_particleRadius'), this.particleSpriteRadius);
    
    // Enable pre-multiplied alpha blending for proper color mixing
    // This prevents white accumulation - colors blend like translucent layers
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // Pre-multiplied alpha
    
    // Render particles as point sprites
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    
    // Restore blend mode
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    this.stats.renderTime = performance.now() - startTime;
  }
  
  /**
   * Spawn new oil particles from paint/splat
   */
  spawnParticles(centerX, centerY, count, color, spawnRadiusPixels = 20.0) {
    // HARD LIMIT for CPU performance (Phase 1)
    const PHASE1_PARTICLE_LIMIT = 5000; // Conservative limit for 60fps
    
    if (this.particleCount >= PHASE1_PARTICLE_LIMIT) {
      console.warn(`⚠️ SPH: Particle limit reached (${PHASE1_PARTICLE_LIMIT}). Ignoring spawn.`);
      return 0;
    }
    
    if (this.particleCount + count > this.maxParticles) {
      console.warn(`Cannot spawn ${count} particles - would exceed max ${this.maxParticles}`);
      count = this.maxParticles - this.particleCount;
    }
    
    // Don't exceed phase 1 limit
    if (this.particleCount + count > PHASE1_PARTICLE_LIMIT) {
      count = PHASE1_PARTICLE_LIMIT - this.particleCount;
    }
    
    if (count <= 0) return 0;
    
    // Convert pixel radius to world space
    const spawnRadius = (spawnRadiusPixels / 1000.0) * this.containerRadius;
    
    for (let i = 0; i < count; i++) {
      const idx = this.particleCount++;
      
      // Random position in circle
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spawnRadius;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      
      // Set particle data
      this.positions[idx * 2] = x;
      this.positions[idx * 2 + 1] = y;
      
      // Spawn with ZERO initial velocity for immediate congealing
      // Particles will be pulled together by cohesion forces, not scattered by initial kick
      this.velocities[idx * 2] = 0;
      this.velocities[idx * 2 + 1] = 0;
      this.forces[idx * 2] = 0;
      this.forces[idx * 2 + 1] = 0;
      this.densities[idx] = this.restDensity;
      this.pressures[idx] = 0;
      this.temperatures[idx] = 60.0; // Default room temperature (was parameter)
      this.phases[idx] = 1; // Oil
      this.colors[idx * 3] = color.r;
      this.colors[idx * 3 + 1] = color.g;
      this.colors[idx * 3 + 2] = color.b;
    }
    
    // Activate positional cohesion boost for newly spawned particles
    // This helps them congeal into a single blob immediately
    if (count > 0) {
      this.posCohesionBoostFrames = 120; // ~2 seconds at 60fps for strong initial congealing
    }
    
    return count;
  }

  /**
   * Count particles within a given world-space radius of a point.
   * Uses the spatial hash for efficiency. Intended for spawn rules
   * that depend on whether a splat lands inside an existing blob.
   */
  countParticlesNear(x, y, radius) {
    if (!this.spatialHash) return 0;
    const neighbors = this.spatialHash.query(x, y, radius);
    return neighbors ? neighbors.length : 0;
  }

  /**
   * Spawn multiple compact clusters that quickly merge
   * @param {number} centerX world x
   * @param {number} centerY world y
   * @param {{r:number,g:number,b:number}} color
   * @param {object} opts
   *  - clusterCount: number of clusters
   *  - particlesPerCluster: particles per cluster
   *  - interClusterRadiusPx: ring radius for cluster centers (pixels)
   *  - clusterRadiusPx: spawn radius inside cluster (pixels)
   */
  spawnClusters(centerX, centerY, color, opts = {}) {
    // DISABLED: Cluster spawning creates multiple separate blobs
    // Instead, spawn all particles in a single tight cluster for immediate blob formation
    const clusterCount = 1; // Force single cluster
    const particlesPerCluster = opts.particlesPerCluster ?? 3;
    const clusterRadiusPx = opts.clusterRadiusPx ?? 10.0;
    
    // Spawn all particles at center in a single tight cluster
    const totalParticles = clusterCount * particlesPerCluster;
    return this.spawnParticles(centerX, centerY, totalParticles, color, clusterRadiusPx);
  }
  
  /**
   * Sample velocity from grid texture at particle positions (bilinear interpolation)
   * Returns array of [vx, vy] for each particle
   * @param {WebGLTexture} velocityTexture - Grid velocity texture (RG format)
   * @param {number} gridWidth - Texture width
   * @param {number} gridHeight - Texture height
   */
  sampleVelocityGrid(velocityTexture, gridWidth, gridHeight) {
    if (!this.gl || !velocityTexture) return null;
    
    const gl = this.gl;
    const gridVelocities = new Float32Array(this.particleCount * 2);
    
    // Read entire velocity texture (TODO: optimize with compute shader)
    const pixels = new Float32Array(gridWidth * gridHeight * 4);
    const tempFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, velocityTexture, 0);
    gl.readPixels(0, 0, gridWidth, gridHeight, gl.RGBA, gl.FLOAT, pixels);
    gl.deleteFramebuffer(tempFBO);
    
    // Sample at each particle position
    for (let i = 0; i < this.particleCount; i++) {
      const x = this.positions[i * 2];
      const y = this.positions[i * 2 + 1];
      
      // Convert world coords [-r, r] to texture coords [0, 1]
      const u = (x / (this.containerRadius * 2)) + 0.5;
      const v = (y / (this.containerRadius * 2)) + 0.5;
      
      // Clamp to valid range
      const uc = Math.max(0, Math.min(1, u));
      const vc = Math.max(0, Math.min(1, v));
      
      // Bilinear sample
      const px = uc * (gridWidth - 1);
      const py = vc * (gridHeight - 1);
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const fx = px - ix;
      const fy = py - iy;
      
      // Sample 4 neighbors
      const ix1 = Math.min(ix + 1, gridWidth - 1);
      const iy1 = Math.min(iy + 1, gridHeight - 1);
      
      const idx00 = (iy * gridWidth + ix) * 4;
      const idx10 = (iy * gridWidth + ix1) * 4;
      const idx01 = (iy1 * gridWidth + ix) * 4;
      const idx11 = (iy1 * gridWidth + ix1) * 4;
      
      // Bilinear interpolation
      const vx00 = pixels[idx00];
      const vy00 = pixels[idx00 + 1];
      const vx10 = pixels[idx10];
      const vy10 = pixels[idx10 + 1];
      const vx01 = pixels[idx01];
      const vy01 = pixels[idx01 + 1];
      const vx11 = pixels[idx11];
      const vy11 = pixels[idx11 + 1];
      
      const vx = (1 - fx) * (1 - fy) * vx00 + fx * (1 - fy) * vx10 + (1 - fx) * fy * vx01 + fx * fy * vx11;
      const vy = (1 - fx) * (1 - fy) * vy00 + fx * (1 - fy) * vy10 + (1 - fx) * fy * vy01 + fx * fy * vy11;
      
      gridVelocities[i * 2] = vx;
      gridVelocities[i * 2 + 1] = vy;
    }
    
    return gridVelocities;
  }
  
  /**
   * Apply grid velocities as drag forces on particles (rotation coupling)
   * @param {Float32Array} gridVelocities - Sampled velocities [vx, vy] per particle
   * @param {number} dragCoeff - Drag coefficient (tune for rotation strength)
   */
  applyGridDragForces(gridVelocities, dragCoeff = 5.0) {
    if (!gridVelocities) return;
    
    for (let i = 0; i < this.particleCount; i++) {
      const vGridX = gridVelocities[i * 2];
      const vGridY = gridVelocities[i * 2 + 1];
      const vParticleX = this.velocities[i * 2];
      const vParticleY = this.velocities[i * 2 + 1];
      
      // Neighbor-aware scaling of drag based on local density
      let scaledDrag = dragCoeff;
      if (this.enableNeighborScaledDrag) {
        const h = this.smoothingRadius;
        const xi = this.positions[i * 2];
        const yi = this.positions[i * 2 + 1];
        const n = this.spatialHash.query(xi, yi, h).length - 1; // exclude self statistically
        const nMin = this.neighborDragNMin;
        const nMax = Math.max(this.neighborDragNMax, nMin + 1);
        const t = Math.max(0, Math.min(1, (n - nMin) / (nMax - nMin)));
        const smooth = t * t * (3.0 - 2.0 * t); // smoothstep
        scaledDrag = dragCoeff * smooth;
      }
      
      // Drag toward grid velocity (rotation + water coupling)
      const fx = scaledDrag * (vGridX - vParticleX);
      const fy = scaledDrag * (vGridY - vParticleY);
      
      // Accumulate (don't overwrite existing forces)
      this.forces[i * 2] += fx;
      this.forces[i * 2 + 1] += fy;
    }

    // Clamp total force magnitude per particle to prevent "helicopter" impulses
    if (this.forceClampMax > 0) {
      const fmax = this.forceClampMax;
      for (let i = 0; i < this.particleCount; i++) {
        const fx = this.forces[i * 2];
        const fy = this.forces[i * 2 + 1];
        const fm = Math.hypot(fx, fy);
        if (fm > fmax && fm > 0) {
          const s = fmax / fm;
          this.forces[i * 2] = fx * s;
          this.forces[i * 2 + 1] = fy * s;
        }
      }
    }
  }

  // Force safety clamp (prevent NaNs and runaway accelerations)
  // Apply at end of force accumulation per frame
  // Note: This should be called after computeForces. Here we clamp in integrate/update via forces array state.
  
  /**
   * Write particle velocities back to grid texture (for continuity with grid-based rendering)
   * @param {WebGLTexture} oilVelocityTexture - Target velocity texture
   * @param {number} gridWidth - Texture width
   * @param {number} gridHeight - Texture height
   */
  writeVelocitiesToGrid(oilVelocityTexture, gridWidth, gridHeight) {
    if (!this.gl || !oilVelocityTexture || this.particleCount === 0) return;
    
    const gl = this.gl;
    
    // Create temp buffer for grid
    const gridData = new Float32Array(gridWidth * gridHeight * 4);
    gridData.fill(0);
    
    // Splat particle velocities to grid with soft falloff
    const splatRadius = 3; // pixels
    
    for (let i = 0; i < this.particleCount; i++) {
      const x = this.positions[i * 2];
      const y = this.positions[i * 2 + 1];
      const vx = this.velocities[i * 2];
      const vy = this.velocities[i * 2 + 1];
      
      // Convert world to grid coords
      const u = (x / (this.containerRadius * 2)) + 0.5;
      const v = (y / (this.containerRadius * 2)) + 0.5;
      const gx = Math.floor(u * gridWidth);
      const gy = Math.floor(v * gridHeight);
      
      // Splat with soft kernel
      for (let dy = -splatRadius; dy <= splatRadius; dy++) {
        for (let dx = -splatRadius; dx <= splatRadius; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          
          if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= splatRadius) {
              const weight = Math.exp(-dist * dist / (splatRadius * splatRadius));
              const idx = (ny * gridWidth + nx) * 4;
              gridData[idx] += vx * weight;
              gridData[idx + 1] += vy * weight;
              gridData[idx + 3] += weight; // Accumulate weight in alpha
            }
          }
        }
      }
    }
    
    // Normalize by accumulated weights
    for (let i = 0; i < gridWidth * gridHeight; i++) {
      const idx = i * 4;
      const weight = gridData[idx + 3];
      if (weight > 0.001) {
        gridData[idx] /= weight;
        gridData[idx + 1] /= weight;
      }
      gridData[idx + 2] = 0;
      gridData[idx + 3] = 1;
    }
    
    // Upload to texture
    gl.bindTexture(gl.TEXTURE_2D, oilVelocityTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 
      gridWidth, gridHeight,
      gl.RGBA, gl.FLOAT, gridData);
  }
  
  /**
   * Remove particles that are outside the container
   */
  removeOutOfBoundsParticles() {
    let writeIdx = 0;
    const threshold = this.containerRadius * 1.1; // 10% buffer
    
    for (let readIdx = 0; readIdx < this.particleCount; readIdx++) {
      const x = this.positions[readIdx * 2];
      const y = this.positions[readIdx * 2 + 1];
      const distFromCenter = Math.sqrt(x * x + y * y);
      
      // Keep particle if inside container
      if (distFromCenter < threshold) {
        if (writeIdx !== readIdx) {
          // Copy particle data to compacted position
          this.positions[writeIdx * 2] = this.positions[readIdx * 2];
          this.positions[writeIdx * 2 + 1] = this.positions[readIdx * 2 + 1];
          this.velocities[writeIdx * 2] = this.velocities[readIdx * 2];
          this.velocities[writeIdx * 2 + 1] = this.velocities[readIdx * 2 + 1];
          this.forces[writeIdx * 2] = this.forces[readIdx * 2];
          this.forces[writeIdx * 2 + 1] = this.forces[readIdx * 2 + 1];
          this.densities[writeIdx] = this.densities[readIdx];
          this.pressures[writeIdx] = this.pressures[readIdx];
          this.temperatures[writeIdx] = this.temperatures[readIdx];
          this.phases[writeIdx] = this.phases[readIdx];
          this.colors[writeIdx * 3] = this.colors[readIdx * 3];
          this.colors[writeIdx * 3 + 1] = this.colors[readIdx * 3 + 1];
          this.colors[writeIdx * 3 + 2] = this.colors[readIdx * 3 + 2];
        }
        writeIdx++;
      }
    }
    
    const removed = this.particleCount - writeIdx;
    if (removed > 0) {
      console.log(`🗑️ Removed ${removed} out-of-bounds particles, ${writeIdx} remain`);
    }
    this.particleCount = writeIdx;
  }
  
  /**
   * Main update loop: physics simulation step
   * PHASE 1.6: Add pressure forces for incompressibility
   */
  update(dt, rotationAmount = 0.0, gridVelocities = null) {
    // Early exit if no particles
    if (this.particleCount === 0) return;
    
    // STEP 0: Remove particles outside container
    this.removeOutOfBoundsParticles();
    
    // Store rotation for force computation
    this.currentRotation = rotationAmount;
    
    // Clamp timestep for stability (tighter to reduce late-frame NaNs)
    dt = Math.min(dt, 0.008); // Max 8ms (125fps)
    
    // PHASE 1/2: SPH pipeline with optional implicit integration
    this.frameIndex++;
    this.updateSpatialHash();
    this.computeDensities();
    this.computePressures();
    this.computeTemperature(dt);
    this.computeForces(); // Now computed for both explicit and implicit paths
    
    // Apply LIGHT grid drag forces - oil should move slower than ink
    // Lower drag = oil lags behind water movement (more realistic)
    if (gridVelocities) {
      this.applyGridDragForces(gridVelocities, this.gridDragCoeff);
    }
    
    if (this.useImplicitIntegration) {
      // PHASE 2: Implicit integration (high surface tension)
      if (!this.implicitSolver) {
        this.implicitSolver = new ImplicitSolver(this);
        console.log('🔧 Implicit solver initialized');
      }
      
      // Solve for new velocities
      const converged = this.implicitSolver.solve(dt);
      
      if (!converged && Math.random() < 0.1) {
        console.warn('⚠️ Implicit solver convergence issue');
      }
      
      // After solver, velocities are updated. Now update positions.
      this._updatePositions(dt);
      // Positional cohesion (PBD-style)
      if (this.enablePositionalCohesion) {
        this.applyPositionalCohesion(dt, this.posCohesionCoeff);
        if (this.posCohesionBoostFrames > 0) {
          for (let k = 0; k < this.posCohesionBoostIters; k++) {
            this.applyPositionalCohesion(dt, this.posCohesionBoostCoeff);
          }
          this.posCohesionBoostFrames--;
        }
      }

    } else {
      // PHASE 1: Explicit integration (standard SPH)
      this.integrate(dt);
      // Positional cohesion (PBD-style)
      if (this.enablePositionalCohesion) {
        this.applyPositionalCohesion(dt, this.posCohesionCoeff);
        if (this.posCohesionBoostFrames > 0) {
          for (let k = 0; k < this.posCohesionBoostIters; k++) {
            this.applyPositionalCohesion(dt, this.posCohesionBoostCoeff);
          }
          this.posCohesionBoostFrames--;
        }
      }
    }
    
    this.enforceBoundaries();
    
    // STEP: Check for blob splitting (throttled for performance)
    if (this.enableSplitting && (this.frameIndex % this.splitCheckInterval === 0)) {
      this.checkAndSplitBlobs();
    }
    
    // Debug: Log density, pressure, and forces
    if (Math.random() < 0.02 && this.particleCount > 0) {
      const i = Math.floor(Math.random() * this.particleCount);
      const x = this.positions[i * 2];
      const y = this.positions[i * 2 + 1];
      const density = this.densities[i];
      const pressure = this.pressures[i];
      const fx = this.forces[i * 2];
      const fy = this.forces[i * 2 + 1];
      const fmag = Math.sqrt(fx * fx + fy * fy);
      
      console.log(`💥 Particle ${i}: density=${density.toFixed(1)}, pressure=${pressure.toFixed(1)}, force=${fmag.toFixed(3)}`);
      
      // Validate
      if (isNaN(pressure) || !isFinite(pressure)) {
        console.error(`❌ INVALID PRESSURE at particle ${i}: ${pressure}`);
      }
    }
  }
  
  /**
   * PHASE 1.4: Apply GENTLE radial gravity toward center
   * This is the "concave plate" model - particles slide toward lowest point
   */
  applyGentleRadialGravity() {
    // VERY GENTLE gravity - we want slow drift, not shooting
    const gravityMag = 0.02; // TINY! (was -9.8 in failed attempt, now 0.02)
    
    for (let i = 0; i < this.particleCount; i++) {
      const x = this.positions[i * 2];
      const y = this.positions[i * 2 + 1];
      const distFromCenter = Math.sqrt(x * x + y * y);
      
      if (distFromCenter > 1e-6) {
        // Direction toward center
        const dirX = -x / distFromCenter;
        const dirY = -y / distFromCenter;
        
        // Apply gentle force
        const fx = dirX * gravityMag * this.particleMass;
        const fy = dirY * gravityMag * this.particleMass;
        
        this.forces[i * 2] = fx;
        this.forces[i * 2 + 1] = fy;
      } else {
        this.forces[i * 2] = 0;
        this.forces[i * 2 + 1] = 0;
      }
    }
  }
  
  /**
   * Rebuild spatial hash grid
   */
  updateSpatialHash() {
    this.spatialHash.clear();
    
    for (let i = 0; i < this.particleCount; i++) {
      const x = this.positions[i * 2];
      const y = this.positions[i * 2 + 1];
      this.spatialHash.insert(i, x, y);
    }
    
    // Build neighbor lists for each particle
    for (let i = 0; i < this.particleCount; i++) {
      const x = this.positions[i * 2];
      const y = this.positions[i * 2 + 1];
      this.neighborLists[i] = this.spatialHash.query(x, y, this.smoothingRadius);
    }
  }
  
  /**
   * SPH Smoothing Kernel: Cubic Spline (simpler, more stable)
   * W(q, h) where q = r/h
   * - More standard in SPH literature
   * - Better numerical stability
   */
  cubicSplineKernel(distSquared, hSquared) {
    const h = Math.sqrt(hSquared);
    const r = Math.sqrt(distSquared);
    const q = r / h;
    
    if (q >= 2.0) return 0;
    
    const sigma = 10.0 / (7.0 * Math.PI * hSquared); // 2D normalization
    
    if (q < 1.0) {
      return sigma * (1.0 - 1.5 * q * q + 0.75 * q * q * q);
    } else {
      const term = 2.0 - q;
      return sigma * 0.25 * term * term * term;
    }
  }
  
  /**
   * Compute density for each particle
   * ρ_i = Σ_j m_j * W(r_ij, h)
   * PHASE 1.5: Using spatial hash for neighbor queries
   */
  computeDensities() {
    const h = this.smoothingRadius;
    const hSquared = h * h;
    const searchRadius = 2.0 * h; // Cubic spline has support up to 2h
    
    for (let i = 0; i < this.particleCount; i++) {
      const xi = this.positions[i * 2];
      const yi = this.positions[i * 2 + 1];
      
      // Query spatial hash for neighbors within 2h (cubic spline support)
      const neighbors = this.spatialHash.query(xi, yi, searchRadius);
      
      let density = 0;
      
      for (const j of neighbors) {
        const xj = this.positions[j * 2];
        const yj = this.positions[j * 2 + 1];
        const dx = xi - xj;
        const dy = yi - yj;
        const rSquared = dx * dx + dy * dy;
        
        // Use cubic spline kernel
        density += this.particleMass * this.cubicSplineKernel(rSquared, hSquared);
      }
      
      // Ensure minimum density (prevent division by zero later)
      this.densities[i] = Math.max(density, this.restDensity * 0.01);
      
      // NaN guard
      if (isNaN(this.densities[i]) || !isFinite(this.densities[i])) {
        console.error(`❌ NaN density at particle ${i}, setting to rest density`);
        this.densities[i] = this.restDensity;
      }
    }
  }
  
  /**
   * Compute pressure from density (Tait equation of state)
   * p = B * ((ρ/ρ₀)^γ - 1)
   * PHASE 1.6: Tension-free (clamp negative pressure to zero)
   */
  computePressures() {
    const B = 6.0; // Higher stiffness to resist compression/collapse
    const gamma = 7.0;
    
    for (let i = 0; i < this.particleCount; i++) {
      const density = this.densities[i];
      const ratio = density / this.restDensity;
      const pressure = B * (Math.pow(ratio, gamma) - 1.0);
      
      // Tension-free: no negative pressure (prevents explosion at low density)
      this.pressures[i] = Math.max(pressure, 0.0);
    }
  }

  /**
   * Compute temperature diffusion between particles
   */
  computeTemperature(dt) {
    const h = this.smoothingRadius;
    const K = this.thermalConductivity;

    // First, copy current temperatures to the next state
    this.nextTemperatures.set(this.temperatures);

    for (let i = 0; i < this.particleCount; i++) {
      const Ti = this.temperatures[i];
      const rhoi = this.densities[i];
      let tempChange = 0;

      const neighbors = this.spatialHash.query(this.positions[i * 2], this.positions[i * 2 + 1], h);

      for (const j of neighbors) {
        if (i === j) continue;

        const Tj = this.temperatures[j];
        const rhoj = this.densities[j];
        
        const dx = this.positions[i * 2] - this.positions[j * 2];
        const dy = this.positions[i * 2 + 1] - this.positions[j * 2 + 1];
        const rSquared = dx * dx + dy * dy;

        // Using viscosity kernel for Laplacian of temperature
        const laplacian = this.viscosityLaplacianKernel(Math.sqrt(rSquared), h);
        
        // SPH formulation for heat equation
        tempChange += (this.particleMass / rhoj) * (K / rhoi) * (Ti - Tj) * laplacian;
      }
      
      this.nextTemperatures[i] += tempChange * dt;

      // Also include simple cooling to room temperature
      const coolingRate = 0.001; // VERY SLOW cooling (was 0.005) - blobs need to persist
      this.nextTemperatures[i] -= (this.temperatures[i] - this.roomTemperature) * coolingRate * dt;
      // NaN/finite guard and clamp to safe range
      if (!isFinite(this.nextTemperatures[i]) || isNaN(this.nextTemperatures[i])) {
        this.nextTemperatures[i] = this.roomTemperature;
      } else {
        this.nextTemperatures[i] = Math.max(-20, Math.min(200, this.nextTemperatures[i]));
      }
    }

    // Swap buffers
    [this.temperatures, this.nextTemperatures] = [this.nextTemperatures, this.temperatures];
  }
  
  /**
   * SPH Pressure Gradient Kernel (Spiky kernel)
   * ∇W(r, h) = -45 / (πh^6) * (h - r)² * (r̂)  for r < h
   * Used for pressure forces (sharp gradient prevents clustering)
   */
  spikyGradientKernel(dx, dy, dist, h) {
    if (dist >= h || dist < 1e-6) return { x: 0, y: 0 };
    const factor = -45.0 / (Math.PI * Math.pow(h, 6));
    const diff = h - dist;
    const magnitude = factor * diff * diff / dist;
    return {
      x: magnitude * dx,
      y: magnitude * dy
    };
  }
  
  /**
   * SPH Viscosity Kernel Laplacian (for viscosity force)
   * ∇²W(r, h) = 45 / (πh^6) * (h - r)  for r < h
   */
  viscosityLaplacianKernel(dist, h) {
    if (dist >= h) return 0;
    return (45.0 / (Math.PI * Math.pow(h, 6))) * (h - dist);
  }
  
  /**
   * Accumulate all forces (pressure, viscosity, gravity)
   * PHASE 1.7: Pressure + Viscosity + Gravity
   */
  computeForces() {
    // Zero out force accumulator
    this.forces.fill(0);
    // Zero XSPH corrections (if used)
    if (this.xsphCoeff > 0) this.xsphCorr.fill(0);
    
    const h = this.smoothingRadius;
    
    // COMBINED LOOP: Pressure + Viscosity (cache efficient - single pass over neighbors)
    for (let i = 0; i < this.particleCount; i++) {
      const xi = this.positions[i * 2];
      const yi = this.positions[i * 2 + 1];
      const pi = this.pressures[i];
      const rhoi = this.densities[i];
      const vxi = this.velocities[i * 2];
      const vyi = this.velocities[i * 2 + 1];
      
      // Query neighbors
      const neighbors = this.spatialHash.query(xi, yi, h);
      
      for (const j of neighbors) {
        if (i === j) continue; // Skip self
        
        const xj = this.positions[j * 2];
        const yj = this.positions[j * 2 + 1];
        const dx = xi - xj;
        const dy = yi - yj;
        const distSq = dx * dx + dy * dy;
        
        // Early exit if outside kernel radius
        if (distSq >= h * h) continue;
        
        const dist = Math.sqrt(distSq);
        
        // === PRESSURE FORCE ===
        const pj = this.pressures[j];
        const rhoj = this.densities[j];
        const pressureTerm = pi / (rhoi * rhoi) + pj / (rhoj * rhoj);
        const grad = this.spikyGradientKernel(dx, dy, dist, h);
        
        const fx_pressure = -this.particleMass * this.particleMass * pressureTerm * grad.x;
        const fy_pressure = -this.particleMass * this.particleMass * pressureTerm * grad.y;
        
        // === VISCOSITY FORCE ===
        const vxj = this.velocities[j * 2];
        const vyj = this.velocities[j * 2 + 1];
        const laplacian = this.viscosityLaplacianKernel(dist, h);
        const viscFactor = this.viscosity * this.particleMass * this.particleMass / rhoj * laplacian;
        
        const fx_viscosity = viscFactor * (vxj - vxi);
        const fy_viscosity = viscFactor * (vyj - vyi);
        
        // NaN guards - prevent corrupting forces
        const fx_total = fx_pressure + fx_viscosity;
        const fy_total = fy_pressure + fy_viscosity;
        
        if (!isNaN(fx_total) && !isNaN(fy_total)) {
          this.forces[i * 2] += fx_total;
          this.forces[i * 2 + 1] += fy_total;
        } else {
          console.warn(`⚠️ NaN force at particle ${i} from neighbor ${j}`);
        }
        
        // XSPH velocity smoothing (helps blobs merge, reduces oscillation)
        if (this.xsphCoeff > 0) {
          const w = (h - dist) > 0 ? (h - dist) / (h + 1e-6) : 0;
          if (w > 0) {
            const rhoAvg = 0.5 * (rhoi + rhoj) + 1e-6;
            const scale = this.xsphCoeff * (this.particleMass / rhoAvg) * w;
            this.xsphCorr[i * 2] += scale * (vxj - vxi);
            this.xsphCorr[i * 2 + 1] += scale * (vyj - vyi);
          }
        }
      }
    }
    
    // STEP 2: EXPLICIT COHESION (short-range every frame, long-range throttled)
    // WITH THINNING DETECTION: Reduce cohesion in thin regions
    const shortCohesion = this.shortCohesion;
    const shortRadius = h * this.shortRadiusScale;
    const minDist = h * this.minDistScale;
    const longCohesion = this.longCohesion;
    const longRadius = h * this.longRadiusScale;

    // Pre-compute thinning factors for each particle (if enabled)
    const thinningFactors = new Float32Array(this.particleCount);
    if (this.enableThinning) {
      for (let i = 0; i < this.particleCount; i++) {
        const xi = this.positions[i * 2];
        const yi = this.positions[i * 2 + 1];
        const rhoi = this.densities[i];
        
        // Check local density relative to rest density
        const densityRatio = rhoi / this.restDensity;
        
        // Count neighbors within short radius
        const neighborsS = this.spatialHash.query(xi, yi, shortRadius);
        const neighborCount = neighborsS.length - 1; // exclude self
        
        // Particle is "thin" if:
        // 1. Density is below threshold, OR
        // 2. Too few neighbors (stretched region)
        // BUT: Don't mark as thin if it has ANY neighbors (might be newly spawned)
        // This prevents newly spawned particles from being marked thin before they congeal
        const hasNeighbors = neighborCount > 0;
        const isThin = hasNeighbors && (
          densityRatio < this.thinningThreshold || 
          neighborCount < this.minNeighborsForThick
        );
        
        // Reduce cohesion in thin regions
        thinningFactors[i] = isThin ? this.cohesionReductionInThin : 1.0;
      }
    } else {
      thinningFactors.fill(1.0);
    }

    // Short-range pass (every frame) - with thinning-aware cohesion
    // Maximum distance check to prevent cross-blob attraction
    const maxCohesionDist = h * this.splitDistance; // Same as positional cohesion limit
    
    for (let i = 0; i < this.particleCount; i++) {
      const xi = this.positions[i * 2];
      const yi = this.positions[i * 2 + 1];
      const neighborsS = this.spatialHash.query(xi, yi, shortRadius);
      const maxShort = 64;
      const sCount = Math.min(neighborsS.length, maxShort);
      const thinFactorI = thinningFactors[i];
      
      for (let n = 0; n < sCount; n++) {
        const j = neighborsS[n];
        if (i === j) continue;
        const dx = this.positions[j * 2] - xi;
        const dy = this.positions[j * 2 + 1] - yi;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist || dist <= 1e-6) continue;
        
        // CRITICAL: Don't apply cohesion if particles are too far apart (different blobs)
        if (dist > maxCohesionDist) continue;
        
        // Apply thinning factor to both particles (neck region gets reduced cohesion)
        const thinFactorJ = thinningFactors[j];
        const combinedThinFactor = Math.min(thinFactorI, thinFactorJ);
        
        const q = dist / shortRadius;
        const falloff = Math.exp(-q * q * 4.0);
        const strength = shortCohesion * falloff * combinedThinFactor;
        if (strength > 0) {
          const invd = 1.0 / dist;
          this.forces[i * 2] += (dx * invd) * strength * this.particleMass;
          this.forces[i * 2 + 1] += (dy * invd) * strength * this.particleMass;
        }
      }
    }

    // Long-range pass (throttled) - with thinning-aware cohesion
    const doLongRange = (this.frameIndex % 3) === 0;
    if (doLongRange && longCohesion > 0 && longRadius > shortRadius) {
      for (let i = 0; i < this.particleCount; i++) {
        const xi = this.positions[i * 2];
        const yi = this.positions[i * 2 + 1];
        const neighborsL = this.spatialHash.query(xi, yi, longRadius);
        const maxLong = 96;
        const lCount = Math.min(neighborsL.length, maxLong);
        const thinFactorI = thinningFactors[i];
        
        for (let n = 0; n < lCount; n++) {
          const j = neighborsL[n];
          if (i === j) continue;
          const dx = this.positions[j * 2] - xi;
          const dy = this.positions[j * 2 + 1] - yi;
          const dist = Math.hypot(dx, dy);
          if (dist < Math.max(minDist, shortRadius) || dist >= longRadius || dist <= 1e-6) continue;
          
          // Apply thinning factor (weaker in long-range, but still applies)
          const thinFactorJ = thinningFactors[j];
          const combinedThinFactor = Math.min(thinFactorI, thinFactorJ);
          
          const q = (dist - shortRadius) / (longRadius - shortRadius);
          const falloff = Math.exp(-q * 2.0);
          const strength = longCohesion * falloff * combinedThinFactor;
          if (strength > 0) {
            const invd = 1.0 / dist;
            this.forces[i * 2] += (dx * invd) * strength * this.particleMass;
            this.forces[i * 2 + 1] += (dy * invd) * strength * this.particleMass;
          }
        }
      }
    }

    // STEP 3: MARANGONI FORCE (surface tension gradient)
    if (this.marangoniStrength > 0) {
        for (let i = 0; i < this.particleCount; i++) {
            // Only apply to surface particles (heuristic: lower density)
            if (this.densities[i] < this.restDensity * 0.9) {
                const Ti = this.temperatures[i];
                
                let gradTx = 0;
                let gradTy = 0;

                const neighbors = this.spatialHash.query(this.positions[i * 2], this.positions[i * 2 + 1], h);

                for (const j of neighbors) {
                    if (i === j) continue;

                    const Tj = this.temperatures[j];
                    const rhoj = this.densities[j];
                    
                    const dx = this.positions[i * 2] - this.positions[j * 2];
                    const dy = this.positions[i * 2 + 1] - this.positions[j * 2 + 1];
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > 1e-6 && dist < h) {
                        const grad = this.spikyGradientKernel(dx, dy, dist, h);
                        const temp_diff = Math.max(-50, Math.min(50, Tj - Ti));
                        
                        // SPH gradient of temperature
                        gradTx += (this.particleMass / rhoj) * temp_diff * grad.x;
                        gradTy += (this.particleMass / rhoj) * temp_diff * grad.y;
                    }
                }
                
                // Force is opposite to temperature gradient (hot to cold)
                this.forces[i * 2] -= this.marangoniStrength * gradTx;
                this.forces[i * 2 + 1] -= this.marangoniStrength * gradTy;
            }
        }
    }
    
    // STEP 4: Radial gravity disabled (was causing global convergence)
    
    // STEP 4: Rotation (tangential force for lava lamp motion)
    const rotation = this.currentRotation || 0.0;
    
    // Debug: Log rotation with force comparison
    if (this.debug && Math.abs(rotation) > 1e-6 && Math.random() < 0.01) {
      // Sample a particle to see force magnitudes
      if (this.particleCount > 0) {
        const i = Math.floor(this.particleCount / 2);
        const x = this.positions[i * 2];
        const y = this.positions[i * 2 + 1];
        const dist = Math.sqrt(x * x + y * y);
        const rotForce = Math.abs(rotation * dist * this.particleMass * 50.0);
        const totalForce = Math.sqrt(this.forces[i * 2] ** 2 + this.forces[i * 2 + 1] ** 2);
        console.log(`🌀 SPH Rotation: ${rotation.toFixed(3)}, rotForce=${rotForce.toFixed(1)}, totalForce=${totalForce.toFixed(1)}, pressure=${this.pressures[i].toFixed(1)}`);
      } else {
        console.log(`🌀 SPH Rotation: ${rotation.toFixed(3)}`);
      }
    }
    
    if (Math.abs(rotation) > 1e-6) {
      for (let i = 0; i < this.particleCount; i++) {
        const x = this.positions[i * 2];
        const y = this.positions[i * 2 + 1];
        const distFromCenter = Math.sqrt(x * x + y * y);
        
        if (distFromCenter > 1e-6) {
          // Tangential direction (perpendicular to radius)
          // For CCW rotation: tangent = (-y, x) / dist
          const tangentX = -y / distFromCenter;
          const tangentY = x / distFromCenter;
          
          // Apply rotation force (balanced for k=20000 cohesion)
          const forceMag = rotation * distFromCenter * this.particleMass * 500.0; // Strong but stable (was 5000)
          this.forces[i * 2] += tangentX * forceMag;
          this.forces[i * 2 + 1] += tangentY * forceMag;
        }
      }
    }
  }
  
  /**
   * Time integration: Update velocities and positions
   * PHASE 1.7: With NaN guards and damping
   */
  integrate(dt) {
    // Update velocities from forces
    for (let i = 0; i < this.particleCount; i++) {
      const fx = this.forces[i * 2];
      const fy = this.forces[i * 2 + 1];
      
      if (isNaN(fx) || isNaN(fy) || !isFinite(fx) || !isFinite(fy)) {
        console.error(`❌ NaN force at particle ${i}, resetting to zero`);
        this.forces[i * 2] = 0;
        this.forces[i * 2 + 1] = 0;
        continue;
      }
      
      this.velocities[i * 2] += (fx / this.particleMass) * dt;
      this.velocities[i * 2 + 1] += (fy / this.particleMass) * dt;
      // Apply XSPH velocity smoothing before damping (if enabled)
      if (this.xsphCoeff > 0) {
        this.velocities[i * 2] += this.xsphCorr[i * 2];
        this.velocities[i * 2 + 1] += this.xsphCorr[i * 2 + 1];
      }
    }
    
    // Apply damping and update positions
    this._updatePositions(dt);
  }

  /**
   * Shared logic for applying damping, velocity caps, and updating positions
   */
  _updatePositions(dt) {
    const damping = this.dampingFactor; // Tunable damping per material
    const maxSpeed = this.maxSpeedCap;  // Tunable cap per material
    
    for (let i = 0; i < this.particleCount; i++) {
      // Quadratic speed damping before linear damping (eats residual kinetic energy)
      const vx0 = this.velocities[i * 2];
      const vy0 = this.velocities[i * 2 + 1];
      const speed0 = Math.hypot(vx0, vy0);
      if (speed0 > 0) {
        const k = this.quadraticDampingK;
        const q = 1.0 / (1.0 + k * speed0);
        this.velocities[i * 2] = vx0 * q;
        this.velocities[i * 2 + 1] = vy0 * q;
      }
      // Apply linear damping
      this.velocities[i * 2] *= damping;
      this.velocities[i * 2 + 1] *= damping;
      
      // Cap velocity magnitude
      const speed = Math.sqrt(this.velocities[i * 2] ** 2 + this.velocities[i * 2 + 1] ** 2);
      if (speed > maxSpeed) {
        const factor = maxSpeed / speed;
        this.velocities[i * 2] *= factor;
        this.velocities[i * 2 + 1] *= factor;
      }
      
      // NaN guard on velocities
      if (isNaN(this.velocities[i * 2]) || isNaN(this.velocities[i * 2 + 1])) {
        console.error(`❌ NaN velocity at particle ${i}, resetting`);
        this.velocities[i * 2] = 0;
        this.velocities[i * 2 + 1] = 0;
      }
      
      // x += v * dt
      this.positions[i * 2] += this.velocities[i * 2] * dt;
      this.positions[i * 2 + 1] += this.velocities[i * 2 + 1] * dt;
      
      // NaN guard on positions
      if (isNaN(this.positions[i * 2]) || isNaN(this.positions[i * 2 + 1])) {
        console.error(`❌ NaN position at particle ${i}, moving to center`);
        this.positions[i * 2] = 0;
        this.positions[i * 2 + 1] = 0;
        this.velocities[i * 2] = 0;
        this.velocities[i * 2 + 1] = 0;
      }
    }
  }
  
  /**
   * Check for disconnected blob clusters and allow them to split
   * Uses graph connectivity analysis to find separate clusters
   */
  checkAndSplitBlobs() {
    if (this.particleCount < this.minClusterSize * 2) return; // Need at least 2 clusters
    
    const h = this.smoothingRadius;
    const connectionDistance = h * this.splitDistance;
    
    // Build connectivity graph: particles are connected if within connectionDistance
    const visited = new Array(this.particleCount).fill(false);
    const clusters = [];
    
    // Find all connected components using DFS
    for (let i = 0; i < this.particleCount; i++) {
      if (visited[i]) continue;
      
      // Start new cluster
      const cluster = [];
      const stack = [i];
      visited[i] = true;
      
      while (stack.length > 0) {
        const current = stack.pop();
        cluster.push(current);
        
        const xi = this.positions[current * 2];
        const yi = this.positions[current * 2 + 1];
        
        // Find all neighbors within connection distance
        const neighbors = this.spatialHash.query(xi, yi, connectionDistance);
        
        for (const j of neighbors) {
          if (visited[j] || j === current) continue;
          
          const xj = this.positions[j * 2];
          const yj = this.positions[j * 2 + 1];
          const dx = xi - xj;
          const dy = yi - yj;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist <= connectionDistance) {
            visited[j] = true;
            stack.push(j);
          }
        }
      }
      
      // Only keep clusters with minimum size
      if (cluster.length >= this.minClusterSize) {
        clusters.push(cluster);
      }
    }
    
    // If we have multiple clusters, they're already split (no action needed)
    // The thinning mechanism will allow them to drift apart naturally
    if (clusters.length > 1 && this.debug && Math.random() < 0.1) {
      console.log(`🔀 Detected ${clusters.length} blob clusters (sizes: ${clusters.map(c => c.length).join(', ')})`);
    }
    
    // Note: We don't actively force particles apart here - the reduced cohesion
    // in thin regions (from thinning detection) will naturally allow clusters
    // to separate when they're stretched thin enough.
  }
  
  /**
   * Enforce circular container boundary (bounce particles back)
   */
  enforceBoundaries() {
    for (let i = 0; i < this.particleCount; i++) {
      let x = this.positions[i * 2];
      let y = this.positions[i * 2 + 1];
      const dist = Math.sqrt(x * x + y * y);
      
      if (dist > this.containerRadius) {
        // Push particle back inside
        const factor = this.containerRadius / dist;
        x *= factor;
        y *= factor;
        this.positions[i * 2] = x;
        this.positions[i * 2 + 1] = y;
        
        // Reflect velocity (bounce with damping)
        const damping = 0.5;
        const nx = x / dist; // Normal
        const ny = y / dist;
        const vx = this.velocities[i * 2];
        const vy = this.velocities[i * 2 + 1];
        const dot = vx * nx + vy * ny;
        this.velocities[i * 2] = (vx - 2 * dot * nx) * damping;
        this.velocities[i * 2 + 1] = (vy - 2 * dot * ny) * damping;
      }
    }
  }
  
  /**
   * Get statistics for debugging
   */
  getStats() {
    return {
      particleCount: this.particleCount,
      maxParticles: this.maxParticles,
      updateTime: this.stats.updateTime.toFixed(2) + 'ms',
      neighborTime: this.stats.neighborTime.toFixed(2) + 'ms',
      forceTime: this.stats.forceTime.toFixed(2) + 'ms',
      integrateTime: this.stats.integrateTime.toFixed(2) + 'ms',
      spatialHash: this.spatialHash.getStats()
    };
  }
}