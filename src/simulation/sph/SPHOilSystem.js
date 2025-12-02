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
    // Cap for density ratio when computing pressure: ρ/ρ0 above this
    // no longer increases pressure. Prevents extremely stiff response
    // at very high densities (helps map extra mass to size/thickness
    // instead of explosive spring).
    this.maxPressureDensityRatio = 1.8;
    // Per-material pressure stiffness multiplier (Tait EOS B term).
    // 1.0 ~= original global stiffness; <1.0 softens pressure response.
    this.pressureStiffness = 1.0;
    this.particleMass = 0.02;         // Mass per particle
    this.viscosity = 0.08;            // Slightly higher to maintain ribbons/filaments
    this.surfaceTension = 50.0;       // DRASTICALLY REDUCED from 3000 - was causing NaN (was insane!)
    this.gravity = -0.01;             // EXTREMELY WEAK: Prevent spreading (was -0.1)
    this.dt = 1 / 60;                   // Timestep

    // Temperature parameters
    this.thermalExpansion = 0.0;      // DISABLED: Causing radial expansion (was 0.001)
    this.thermalConductivity = 0.1;   // Heat diffusion rate
    this.roomTemperature = 20.0;      // Celsius
    this.marangoniStrength = 0.0;     // DISABLED: Causing radial explosion (was 5.0)

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
    // Explicit IPF-style cohesion term (short-range attractive force between nearby particles)
    this.ipfStrength = 0.0;        // base IPF attraction magnitude (per material)
    this.ipfInnerRadiusScale = 0.55; // inner radius (in units of h) where IPF starts to act
    this.ipfOuterRadiusScale = 1.0;  // outer radius (in units of h) where IPF goes to zero
    this.spawnSpeedScale = 1.0;  // multiply base spawn speed
    this.gridDragCoeff = 1.3;    // coupling to grid velocities
    this.maxSpeedCap = 0.3;      // REDUCED: Lower speed cap for calmer motion
    this.xsphCoeff = 0.0;        // XSPH velocity smoothing (0 disables)
    this.particleSpriteRadius = 100.0; // Moderate size for good overlap
    this.dampingFactor = 0.94;   // per-material velocity damping in _updatePositions
    this.forceClampMax = 2.0;    // REDUCED: Tighter force clamp prevents sudden jerks
    this.quadraticDampingK = 6.0; // VERY HIGH: Strong velocity damping
    // Universal positional cohesion (PBD-style)
    this.enablePositionalCohesion = true;
    this.posCohesionCoeff = 0.12; // 0..1 blend toward local centroid
    this.maxPosNudge = 0.004;     // as fraction of containerRadius per frame
    this.posCohesionRadiusScale = 1.0; // radius in units of h for positional cohesion neighborhood
    // Neighbor-aware drag (scale grid drag by local density)
    this.enableNeighborScaledDrag = true;
    this.neighborDragNMin = 3;
    this.neighborDragNMax = 10;
    // Positional cohesion boost after spawn (kept gentle to avoid collapse→explode)
    this.posCohesionBoostFrames = 0;
    this.posCohesionBoostCoeff = 0.18; // softer temporary pull
    this.posCohesionBoostIters = 2;    // fewer extra iterations per frame during boost

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

    // === BLOB PHYSICS TUNING ===
    // Simplified model parameters (Lennard-Jones style)
    // Tuned for VERY CALM, stable blobs (minimal jitter)
    this.blobCohesion = 0.25;     // VERY LOW: Gentle attraction
    this.blobRepulsion = 0.8;     // VERY LOW: Soft repulsion
    this.blobInteractionRadius = 0.16; // Moderate interaction range
    this.blobFriction = 0.95;     // HIGH: Strong damping kills jitter
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

      // Neighbor-aware scaling of drag based on local density / thickness
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

      // Additional density-based modulation: thicker (denser) regions should
      // resist water motion more than thin fringes.
      const rho = this.densities[i];
      const densityRatio = rho / (this.restDensity || 1.0);
      // Map densityRatio in [0.5, 2.0] to a factor in roughly [1.2, 0.6]
      const clampedRatio = Math.max(0.5, Math.min(2.0, densityRatio));
      const inv = 1.0 / clampedRatio; // higher density → smaller factor
      const densityFactor = 0.6 + 0.6 * inv; // ρ=ρ0 → ~1.2, very dense → ~0.6
      scaledDrag *= densityFactor;

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

    // Clamp timestep for stability
    dt = Math.min(dt, 0.008);

    // PHASE 1/2: Simplified "Blob Physics" pipeline

    // 1. Reset forces & grid
    this.spatialHash.clear();
    for (let i = 0; i < this.particleCount; i++) {
      this.spatialHash.insert(i, this.positions[i * 2], this.positions[i * 2 + 1]);
      this.forces[i * 2] = 0;
      this.forces[i * 2 + 1] = 0;
    }

    // 2. Compute Forces (Cohesion + Repulsion + Drag)
    this.computeBlobForces(dt);

    // 3. Apply External Forces
    // Grid Drag (Water -> Oil coupling)
    if (gridVelocities) {
      this.applyGridDragForces(gridVelocities, this.gridDragCoeff);
    }
    // Gravity (weak vertical)
    for (let i = 0; i < this.particleCount; i++) {
      this.forces[i * 2 + 1] += this.gravity;
    }

    // Rotation-driven tilt gravity (New "Blob" version of rotation coupling)
    // Maps rotation to a gentle body force
    const rotation = this.currentRotation || 0.0;
    if (Math.abs(rotation) > 1e-6) {
      const tiltDirX = rotation > 0 ? 0.7 : -0.7;
      const tiltDirY = 1.0;
      const len = Math.hypot(tiltDirX, tiltDirY) || 1.0;
      const nx = tiltDirX / len;
      const ny = tiltDirY / len;

      // Base force magnitude
      const base = 25.0;

      for (let i = 0; i < this.particleCount; i++) {
        // Simple mass-based force
        const forceMag = Math.sign(rotation) * this.particleMass * base;
        this.forces[i * 2] += nx * forceMag;
        this.forces[i * 2 + 1] += ny * forceMag;
      }
    }

    // 4. Integrate (Verlet-ish)
    this.integrate(dt);

    // 5. Enforce Boundaries
    this.enforceBoundaries();

    this.frameIndex++;
    this.updateSpatialHash();

    // STEP: Check for blob splitting (throttled)
    if (this.enableSplitting && (this.frameIndex % this.splitCheckInterval === 0)) {
      this.checkAndSplitBlobs();
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
   * PHASE 1/2: Simplified "Blob Physics" Force Computation
   * Uses Cohesion + Repulsion + Damping instead of Pressure/Viscosity
   */
  computeBlobForces(dt) {
    const h = this.blobInteractionRadius;
    const h2 = h * h;

    // Lennard-Jones-ish potential tuning
    // We want a stable distance around r = 0.6 * h
    const targetDist = h * 0.6;

    for (let i = 0; i < this.particleCount; i++) {
      const xi = this.positions[i * 2];
      const yi = this.positions[i * 2 + 1];
      const vxi = this.velocities[i * 2];
      const vyi = this.velocities[i * 2 + 1];

      const neighbors = this.spatialHash.query(xi, yi, h);

      for (const j of neighbors) {
        if (i === j) continue;

        const xj = this.positions[j * 2];
        const yj = this.positions[j * 2 + 1];
        const vxj = this.velocities[j * 2];
        const vyj = this.velocities[j * 2 + 1];

        let dx = xi - xj;
        let dy = yi - yj;
        let dist2 = dx * dx + dy * dy;

        if (dist2 > h2 || dist2 < 0.00001) continue;

        const dist = Math.sqrt(dist2);
        const invDist = 1.0 / dist;
        const nx = dx * invDist; // Normalized direction from j to i
        const ny = dy * invDist;

        // Force magnitude
        // Positive = Repulsion (push away)
        // Negative = Attraction (pull together)
        let force = 0;

        if (dist < targetDist) {
          // Repulsion: Strong push away if too close
          // Linear repulsion is stable: F = k * (target - dist)
          const pct = 1.0 - (dist / targetDist);
          force = this.blobRepulsion * pct;
        } else {
          // Cohesion: Pull together if within range but not too close
          // Smooth falloff
          const pct = 1.0 - ((dist - targetDist) / (h - targetDist));
          // Curve it so it's strongest in the middle, zero at edges
          const curve = pct * pct * (3 - 2 * pct);
          force = -this.blobCohesion * curve; // Negative = Attraction
        }

        // --- Inter-particle Viscosity (Damping) ---
        // Resists relative motion along the normal - CRITICAL for killing jitter
        const dvx = vxi - vxj;
        const dvy = vyi - vyj;
        const relVel = dvx * nx + dvy * ny; // Relative velocity along normal

        // High viscosity coefficient kills oscillation dead
        const viscosity = 2.0; // VERY HIGH: Maximum damping for stable blobs
        const dampingForce = -viscosity * relVel;

        force += dampingForce;

        const fx = nx * force;
        const fy = ny * force;

        this.forces[i * 2] += fx;
        this.forces[i * 2 + 1] += fy;
      }
    }
  }

  /**
   * Shared logic for applying damping, velocity caps, and updating positions
   */
  _updatePositions(dt) {
    const damping = this.blobFriction; // Use the tuned blob friction
    const maxSpeed = this.maxSpeedCap;

    for (let i = 0; i < this.particleCount; i++) {
      // Re-enable Quadratic speed damping (gentle) to kill high-freq vibration
      const vx0 = this.velocities[i * 2];
      const vy0 = this.velocities[i * 2 + 1];
      const speed0 = Math.hypot(vx0, vy0);
      if (speed0 > 0) {
        const k = 0.5; // Gentle quadratic drag (was 2.0)
        const q = 1.0 / (1.0 + k * speed0);
        this.velocities[i * 2] = vx0 * q;
        this.velocities[i * 2 + 1] = vy0 * q;
      }

      // Apply linear damping, modulated slightly by local density so dense
      // cores are more damped (less oscillatory) than thin fringes.
      const rho = this.densities[i];
      const densityRatio = rho / (this.restDensity || 1.0);
      const clampedRatio = Math.max(0.5, Math.min(2.0, densityRatio));
      // Map clampedRatio in [0.5, 2.0] to a damping scale in ~[0.9, 1.1]
      //  - thin (low density) blobs keep slightly more kinetic energy
      //  - dense cores lose a bit more per step
      const inv = 1.0 / clampedRatio;
      const dampingScale = 0.9 + 0.2 * inv;
      const localDamping = damping * dampingScale;

      this.velocities[i * 2] *= localDamping;
      this.velocities[i * 2 + 1] *= localDamping;

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