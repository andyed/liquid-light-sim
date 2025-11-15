// sph-particle-splat.vert.wgsl
// WebGPU Vertex Shader for SPH particle splatting

struct Particle {
    pos: vec2<f32>,
    vel: vec2<f32>,
    density: f32,
    color: vec4<f32>, // Assuming color is now part of the particle struct
};

@group(0) @binding(0)
var<storage, read> particles: array<Particle>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) v_color: vec4<f32>,
    @location(1) v_uv: vec2<f32>,
};

@vertex
fn main(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32
) -> VertexOutput {
    var output: VertexOutput;

    let particle = particles[instance_index];

    // Define a quad for each particle
    let quad_positions = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0,  1.0),
    );

    let quad_uvs = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
    );

    let vertex_pos = quad_positions[vertex_index];
    let vertex_uv = quad_uvs[vertex_index];

    // Particle size based on density (adjust scaling factor as needed)
    let particle_size = 0.01 * sqrt(particle.density); // Example scaling

    // Transform to screen space
    output.position = vec4<f32>(
        particle.pos.x + vertex_pos.x * particle_size,
        particle.pos.y + vertex_pos.y * particle_size,
        0.0,
        1.0
    );

    output.v_color = particle.color;
    output.v_uv = vertex_uv;

    return output;
}
