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
    
    // BALANCED exponential falloff: sharp but reachable
    // Exponential with moderate steepness for clean edges while maintaining blob formation
    float falloff = exp(-2.0 * dist * dist); // Less aggressive than -3.0
    falloff = clamp(falloff, 0.0, 1.0);
    
    // Edge fade: reduce alpha near container boundary to prevent glow
    float distFromCenter = length(v_worldPos);
    float edgeFade = 1.0 - smoothstep(u_containerRadius * 0.85, u_containerRadius * 0.95, distFromCenter);
    
    // VERY HIGH alpha for strong field contribution
    // Each particle needs to contribute significantly to reach threshold
    float alpha = falloff * 1.0 * edgeFade; // MAXED for visibility (was 0.8)
    
    // PRE-MULTIPLY color by alpha for proper pigment mixing
    // This prevents white accumulation - colors will blend like translucent layers
    vec3 premultiplied = v_color * alpha;
    
    // Output: Pre-multiplied color + alpha channel
    // Alpha blending will now mix colors properly instead of making white
    fragColor = vec4(premultiplied, alpha);
}
