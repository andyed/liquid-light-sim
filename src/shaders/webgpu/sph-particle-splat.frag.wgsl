// sph-particle-splat.frag.wgsl
// WebGPU Fragment Shader for SPH particle splatting

@fragment
fn main(
    @location(0) v_color: vec4<f32>,
    @location(1) v_uv: vec2<f32>
) -> @location(0) vec4<f32> {
    // Calculate distance from center of the quad (0.0 to 1.0 range for v_uv)
    let dist_from_center = distance(v_uv, vec2<f32>(0.5, 0.5));

    // Create a soft circular falloff (similar to the GLSL version)
    // The power can be adjusted for different falloff profiles
    let alpha = pow(1.0 - dist_from_center * 2.0, 2.0); // Example: squared falloff

    // Apply pre-multiplied alpha
    return vec4<f32>(v_color.rgb * alpha, v_color.a * alpha);
}
