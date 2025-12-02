#version 300 es
// sph-particle-splat.frag.glsl
// Fragment shader for SPH particle rendering
// Renders each particle as a soft circular splat with organic falloff

precision highp float;

// From vertex shader
in vec3 v_color;
in float v_density;
in vec2 v_worldPos;

// Uniforms
uniform float u_containerRadius;

// Output
out vec4 fragColor;

// Attempt a smoother, more organic falloff curve
// Combines gaussian core with polynomial tail for soft edges
float organicFalloff(float dist) {
    // Gaussian core (strong center)
    float gaussian = exp(-1.2 * dist * dist);
    
    // Polynomial tail (soft edge that reaches further)
    float poly = 1.0 - dist;
    poly = poly * poly * poly; // Cubic falloff
    poly = max(poly, 0.0);
    
    // Blend: gaussian dominates center, polynomial extends edges
    return mix(poly, gaussian, 0.6);
}

void main() {
    // gl_PointCoord: [0,0] at top-left, [1,1] at bottom-right of point sprite
    // Convert to centered coords: [-1,-1] to [1,1]
    vec2 coord = gl_PointCoord * 2.0 - 1.0;
    float dist = length(coord);
    
    // Soft circular boundary (no hard discard - let falloff handle it)
    if (dist > 1.2) {
        discard; // Only discard well outside the circle
    }
    
    // Organic falloff: soft gaussian core with extended polynomial tail
    float falloff = organicFalloff(dist);
    
    // Edge fade: reduce alpha near container boundary to prevent glow
    float distFromCenter = length(v_worldPos);
    float edgeFade = 1.0 - smoothstep(u_containerRadius * 0.85, u_containerRadius * 0.95, distFromCenter);
    
    // Density-based gain: denser particles contribute more to the field
    // This helps thick blob cores stay solid while thin edges fade naturally
    float rhoNorm = clamp(v_density / 1000.0, 0.3, 2.5);
    float densityGain = pow(rhoNorm, 0.5); // Gentler curve for more uniform blobs
    
    // Density also affects splat "spread" - denser = slightly larger effective radius
    float densitySpread = 1.0 + (rhoNorm - 1.0) * 0.15;
    falloff = organicFalloff(dist / densitySpread);

    // Alpha: geometric falloff * density-based gain * edge fade
    float alpha = falloff * densityGain * edgeFade;
    
    // Boost alpha slightly to ensure good overlap between particles
    alpha *= 1.3;
    alpha = clamp(alpha, 0.0, 1.0);
    
    // PRE-MULTIPLY color by alpha for proper pigment mixing
    // This prevents white accumulation - colors will blend like translucent layers
    vec3 premultiplied = v_color * alpha;
    
    // Output: Pre-multiplied color + alpha channel
    fragColor = vec4(premultiplied, alpha);
}
