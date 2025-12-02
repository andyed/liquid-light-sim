// src/shaders/webgpu/sph-render.wgsl
// WebGPU particle rendering - reads directly from compute buffer

// Must match sph-gpu.wgsl Particle struct
struct Particle {
    pos: vec2<f32>,      // 8 bytes
    vel: vec2<f32>,      // 8 bytes
    force: vec2<f32>,    // 8 bytes
    density: f32,        // 4 bytes
    pressure: f32,       // 4 bytes
    color: vec3<f32>,    // 12 bytes
    _pad: f32,           // 4 bytes
};  // Total: 48 bytes

struct Particles {
    data: array<Particle>,
};

struct RenderUniforms {
    resolution: vec2<f32>,
    containerRadius: f32,
    particleSpriteRadius: f32,
    particleCount: u32,
    _pad: vec3<u32>,
};

@group(0) @binding(0)
var<storage, read> particles: Particles;

@group(0) @binding(1)
var<uniform> uniforms: RenderUniforms;

// Vertex output
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
    @location(1) pointCoord: vec2<f32>,
    @location(2) density: f32,
};

// Vertex shader - generates quad vertices for each particle
@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    var output: VertexOutput;
    
    // Early out for particles beyond count
    if (instanceIndex >= uniforms.particleCount) {
        output.position = vec4<f32>(0.0, 0.0, -2.0, 1.0); // Behind camera
        output.color = vec3<f32>(0.0);
        output.pointCoord = vec2<f32>(0.0);
        output.density = 0.0;
        return output;
    }
    
    let particle = particles.data[instanceIndex];
    
    // Quad vertices (2 triangles = 6 vertices)
    // Triangle 1: 0,1,2  Triangle 2: 2,1,3
    var quadPos: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),  // 0: bottom-left
        vec2<f32>( 1.0, -1.0),  // 1: bottom-right
        vec2<f32>(-1.0,  1.0),  // 2: top-left
        vec2<f32>(-1.0,  1.0),  // 2: top-left
        vec2<f32>( 1.0, -1.0),  // 1: bottom-right
        vec2<f32>( 1.0,  1.0),  // 3: top-right
    );
    
    let localPos = quadPos[vertexIndex];
    
    // Convert world position to normalized device coordinates
    // World coords: [-containerRadius, containerRadius] -> NDC: [-1, 1]
    // Note: Flip Y to match WebGL texture coordinate convention
    let worldToNDC = 1.0 / uniforms.containerRadius;
    let centerNDC = vec2<f32>(particle.pos.x, -particle.pos.y) * worldToNDC;
    
    // Sprite size in NDC (based on screen resolution)
    let spriteSize = uniforms.particleSpriteRadius / min(uniforms.resolution.x, uniforms.resolution.y) * 2.0;
    
    // Final position
    let offsetNDC = localPos * spriteSize;
    output.position = vec4<f32>(centerNDC + offsetNDC, 0.0, 1.0);
    
    // Pass through color and density
    output.color = particle.color;
    output.density = particle.density;
    
    // Point coord for circular falloff (0,0 at center, 1,1 at corner)
    output.pointCoord = localPos * 0.5 + 0.5;
    
    return output;
}

// Organic falloff function (matches CPU sph-particle-splat.frag.glsl)
fn organicFalloff(dist: f32) -> f32 {
    // Gaussian core (strong center)
    let gaussian = exp(-1.2 * dist * dist);
    
    // Polynomial tail (soft edge)
    var poly = 1.0 - dist;
    poly = poly * poly * poly;
    poly = max(poly, 0.0);
    
    // Blend: gaussian dominates center, polynomial extends edges
    return mix(poly, gaussian, 0.6);
}

// Fragment shader - renders soft circular splat
@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Convert pointCoord to centered coords [-1, 1]
    let coord = input.pointCoord * 2.0 - 1.0;
    let dist = length(coord);
    
    // Discard outside circle
    if (dist > 1.2) {
        discard;
    }
    
    // Organic falloff
    let falloff = organicFalloff(dist);
    
    // Density-based gain
    let rhoNorm = clamp(input.density / 1000.0, 0.3, 2.5);
    let densityGain = pow(rhoNorm, 0.5);
    
    // Density spread
    let densitySpread = 1.0 + (rhoNorm - 1.0) * 0.15;
    let adjustedFalloff = organicFalloff(dist / densitySpread);
    
    // Final alpha
    var alpha = adjustedFalloff * densityGain;
    alpha = alpha * 1.3; // Boost for overlap
    alpha = clamp(alpha, 0.0, 1.0);
    
    // Pre-multiplied alpha
    let premultiplied = input.color * alpha;
    
    return vec4<f32>(premultiplied, alpha);
}
