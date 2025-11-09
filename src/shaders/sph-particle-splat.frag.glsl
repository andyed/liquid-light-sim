#version 300 es
// sph-particle-splat.frag.glsl
// Fragment shader for SPH particle rendering
// Renders each particle as a soft circular splat

precision highp float;

// From vertex shader
in vec3 v_color;
in float v_density;
in vec2 v_worldPos;

// Uniforms (need container radius for edge fade)
uniform float u_containerRadius;

// Output
out vec4 fragColor;

void main() {
    // gl_PointCoord: [0,0] at top-left, [1,1] at bottom-right of point sprite
    // Convert to centered coords: [-1,-1] to [1,1]
    vec2 coord = gl_PointCoord * 2.0 - 1.0;
    float dist = length(coord);
    
    // Circular falloff (soft edge)
    // Distance 0.0 (center) = full opacity
    // Distance 1.0 (edge) = zero opacity
    if (dist > 1.0) {
        discard; // Outside circle
    }
    
    // Gaussian-like falloff for MetaBall field (smoother accumulation)
    // Use quadratic falloff instead of linear for better blending
    float falloff = 1.0 - dist * dist; // Quadratic: [1.0 at center, 0.0 at edge]
    falloff = clamp(falloff, 0.0, 1.0);
    
    // Edge fade: reduce alpha near container boundary to prevent glow
    float distFromCenter = length(v_worldPos);
    float edgeFade = 1.0 - smoothstep(u_containerRadius * 0.85, u_containerRadius * 0.95, distFromCenter);
    
    // Very low alpha to prevent oversaturation during continuous painting
    // With additive blending, many particles accumulate - keep each contribution small
    float alpha = falloff * 0.15 * edgeFade; // Low per-particle (was 0.6, caused oversaturation)
    
    // Output: RGB color with thickness-like alpha
    // Additive blending will accumulate to create MetaBall field
    fragColor = vec4(v_color, alpha);
}
