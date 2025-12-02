// src/shaders/sph-gpu.wgsl
// WebGPU compute shaders for SPH particle simulation

struct Particle {
    pos: vec2<f32>,      // 8 bytes
    vel: vec2<f32>,      // 8 bytes
    force: vec2<f32>,    // 8 bytes
    density: f32,        // 4 bytes
    pressure: f32,       // 4 bytes
    color: vec3<f32>,    // 12 bytes
    _pad: f32,           // 4 bytes (alignment)
};  // Total: 48 bytes

struct Particles {
    data: array<Particle>,
};

@group(0) @binding(0)
var<storage, read_write> particles: Particles;

struct Uniforms {
    particleCount: u32,  // Active particle count (not max)
    dt: f32,
    smoothingRadius: f32,
    restDensity: f32,
    particleMass: f32,
    viscosity: f32,
    ipfStrength: f32,
    containerRadius: f32,
    // Blob physics parameters
    blobCohesion: f32,
    blobRepulsion: f32,
    blobFriction: f32,
    _pad: f32,
};

@group(0) @binding(1)
var<uniform> uniforms: Uniforms;

// SPH Smoothing Kernel: Cubic Spline
fn cubicSplineKernel(distSquared: f32, h: f32) -> f32 {
    let hSquared = h * h;
    if (distSquared >= hSquared) { return 0.0; }

    let q = sqrt(distSquared) / h;
    let sigma = 10.0 / (7.0 * 3.1415926535 * hSquared); // 2D normalization

    if (q < 0.5) {
        let q2 = q * q;
        let q3 = q2 * q;
        return sigma * (6.0 * (q3 - q2) + 1.0);
    } else {
        let term = 1.0 - q;
        return sigma * 2.0 * term * term * term;
    }
}

fn spikyGradientKernel(r: vec2<f32>, h: f32) -> vec2<f32> {
    let dist = length(r);
    if (dist > h || dist == 0.0) { return vec2<f32>(0.0, 0.0); }
    let h2 = h * h;
    let h6 = h2 * h2 * h2;
    let factor = -45.0 / (3.1415926535 * h6);
    let diff = h - dist;
    return (factor * diff * diff / dist) * r;
}

fn viscosityLaplacianKernel(dist: f32, h: f32) -> f32 {
    if (dist > h) { return 0.0; }
    let h2 = h * h;
    let h6 = h2 * h2 * h2;
    let factor = 45.0 / (3.1415926535 * h6);
    return factor * (h - dist);
}

// ============================================================================
// COMPUTE PASSES - Simplified Blob Physics (matches CPU SPHOilSystem)
// ============================================================================

@compute @workgroup_size(64)
fn compute_density(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= uniforms.particleCount) { return; }

    var density = 0.0;
    let pos_i = particles.data[i].pos;
    let h = uniforms.smoothingRadius;

    for (var j: u32 = 0u; j < uniforms.particleCount; j = j + 1u) {
        let pos_j = particles.data[j].pos;
        let distSq = dot(pos_i - pos_j, pos_i - pos_j);
        density += uniforms.particleMass * cubicSplineKernel(distSq, h);
    }
    particles.data[i].density = max(density, 0.001);
}

@compute @workgroup_size(64)
fn compute_pressure(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= uniforms.particleCount) { return; }

    // Soft pressure (not used much in blob physics, but keep for compatibility)
    let B = 2.0;
    let gamma = 7.0;
    let ratio = particles.data[i].density / uniforms.restDensity;
    let pressure = B * (pow(ratio, gamma) - 1.0);
    particles.data[i].pressure = max(pressure, 0.0);
}

@compute @workgroup_size(64)
fn compute_forces(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= uniforms.particleCount) { return; }

    var force = vec2<f32>(0.0, 0.0);
    let p_i = particles.data[i];
    let h = uniforms.smoothingRadius;
    let targetDist = h * 0.6;  // Equilibrium distance

    for (var j: u32 = 0u; j < uniforms.particleCount; j = j + 1u) {
        if (i == j) { continue; }
        let p_j = particles.data[j];
        let r = p_i.pos - p_j.pos;
        let dist = length(r);

        if (dist < h && dist > 0.0001) {
            let nx = r.x / dist;
            let ny = r.y / dist;

            // Lennard-Jones style blob physics
            var f: f32 = 0.0;
            if (dist < targetDist) {
                // Repulsion: push away if too close
                let pct = 1.0 - (dist / targetDist);
                f = uniforms.blobRepulsion * pct;
            } else {
                // Cohesion: pull together if within range
                let pct = 1.0 - ((dist - targetDist) / (h - targetDist));
                let curve = pct * pct * (3.0 - 2.0 * pct);  // smoothstep
                f = -uniforms.blobCohesion * curve;
            }

            // Inter-particle viscosity (damping)
            let dvx = p_i.vel.x - p_j.vel.x;
            let dvy = p_i.vel.y - p_j.vel.y;
            let relVel = dvx * nx + dvy * ny;
            let viscosity = 2.0;  // Strong damping
            f += -viscosity * relVel;

            force.x += nx * f;
            force.y += ny * f;
        }
    }

    // Clamp force magnitude
    let forceMag = length(force);
    if (forceMag > 2.0) {
        force = force * (2.0 / forceMag);
    }

    particles.data[i].force = force;
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= uniforms.particleCount) { return; }

    let p = &particles.data[i];
    let dt = uniforms.dt;
    
    // Apply force
    let acceleration = (*p).force / uniforms.particleMass;
    (*p).vel += acceleration * dt;

    // Quadratic damping (kills high-frequency oscillation)
    let speed = length((*p).vel);
    if (speed > 0.0) {
        let k = 6.0;
        let q = 1.0 / (1.0 + k * speed);
        (*p).vel = (*p).vel * q;
    }

    // Linear friction
    (*p).vel = (*p).vel * uniforms.blobFriction;

    // Speed cap
    let maxSpeed = 0.3;
    let newSpeed = length((*p).vel);
    if (newSpeed > maxSpeed) {
        (*p).vel = (*p).vel * (maxSpeed / newSpeed);
    }

    // Update position
    (*p).pos += (*p).vel * dt;

    // Boundary conditions (circular container)
    let r = uniforms.containerRadius;
    let d = length((*p).pos);
    if (d > r) {
        (*p).pos = ((*p).pos / d) * r;
        // Reflect velocity with damping
        let n = (*p).pos / d;
        let vDotN = dot((*p).vel, n);
        (*p).vel = ((*p).vel - 2.0 * vDotN * n) * 0.5;
    }
}
