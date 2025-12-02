// src/shaders/sph-gpu.wgsl

struct Particle {
    pos: vec2<f32>,
    vel: vec2<f32>,
    force: vec2<f32>,
    density: f32,
    pressure: f32,
};

struct Particles {
    data: array<Particle>,
};

@group(0) @binding(0)
var<storage, read_write> particles: Particles;

struct Uniforms {
    maxParticles: u32,
    dt: f32,
    smoothingRadius: f32,
    restDensity: f32,
    particleMass: f32,
    viscosity: f32,
    ipfStrength: f32,
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

@compute @workgroup_size(64)
fn compute_density(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= uniforms.maxParticles) { return; }

    var density = 0.0;
    let pos_i = particles.data[i].pos;

    for (var j: u32 = 0u; j < uniforms.maxParticles; j = j + 1u) {
        let pos_j = particles.data[j].pos;
        let distSq = dot(pos_i - pos_j, pos_i - pos_j);
        density += uniforms.particleMass * cubicSplineKernel(distSq, uniforms.smoothingRadius);
    }
    particles.data[i].density = max(density, 0.001);
}

@compute @workgroup_size(64)
fn compute_pressure(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= uniforms.maxParticles) { return; }

    let B = 6.0; // Stiffness
    let gamma = 7.0;
    let ratio = particles.data[i].density / uniforms.restDensity;
    let pressure = B * (pow(ratio, gamma) - 1.0);
    particles.data[i].pressure = max(pressure, 0.0);
}

@compute @workgroup_size(64)
fn compute_forces(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= uniforms.maxParticles) { return; }

    var force = vec2<f32>(0.0, 0.0);
    let p_i = particles.data[i];

    for (var j: u32 = 0u; j < uniforms.maxParticles; j = j + 1u) {
        if (i == j) { continue; }
        let p_j = particles.data[j];
        let r = p_i.pos - p_j.pos;
        let dist = length(r);

        if (dist < uniforms.smoothingRadius) {
            // Pressure force
            let pressure_term = (p_i.pressure / (p_i.density * p_i.density)) + (p_j.pressure / (p_j.density * p_j.density));
            force += -uniforms.particleMass * uniforms.particleMass * pressure_term * spikyGradientKernel(r, uniforms.smoothingRadius);

            // Viscosity force
            let viscosity_term = uniforms.viscosity * uniforms.particleMass * uniforms.particleMass / p_j.density * viscosityLaplacianKernel(dist, uniforms.smoothingRadius);
            force += viscosity_term * (p_j.vel - p_i.vel);

            // IPF cohesion (explicit, short-range, density-biased)
            if (uniforms.ipfStrength > 0.0) {
                let innerR = 0.55 * uniforms.smoothingRadius;
                let outerR = 1.0 * uniforms.smoothingRadius;
                if (dist > innerR && dist < outerR) {
                    let rest = uniforms.restDensity;
                    let rho_i = p_i.density;
                    let rho_j = p_j.density;
                    // Only pull thinner particles toward denser neighbors
                    let densityDelta = (rho_j - rho_i) / rest; // >0 when neighbor is denser
                    let densityScale = clamp(densityDelta, 0.0, 1.0);
                    // High-density cutoff: do not keep tightening existing dense rims
                    let coreThresh = 1.1 * rest;
                    let bothCore = (rho_i >= coreThresh) && (rho_j >= coreThresh);
                    if (densityScale > 0.0 && !bothCore) {
                        let span = max(1e-6, outerR - innerR);
                        let t = (dist - innerR) / span; // 0 at innerR, 1 at outerR
                        let falloff = 1.0 - t;
                        let w = falloff * falloff;
                        let dir = normalize(p_j.pos - p_i.pos);
                        let s = uniforms.ipfStrength * w * densityScale * uniforms.particleMass;
                        force += s * dir;
                    }
                }
            }
        }
    }

    particles.data[i].force = force;
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= uniforms.maxParticles) { return; }

    let p = &particles.data[i];
    let acceleration = (*p).force / uniforms.particleMass;
    (*p).vel += acceleration * uniforms.dt;
    (*p).pos += (*p).vel * uniforms.dt;

    // Boundary conditions
    let r = 0.48; // containerRadius
    let d = length((*p).pos);
    if (d > r) {
        (*p).pos = ((*p).pos / d) * r;
        (*p).vel = (*p).vel - 2.0 * dot((*p).vel, (*p).pos/d) * (*p).pos/d;
    }
}
