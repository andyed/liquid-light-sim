#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;
uniform float u_blurRadius;      // Blur kernel radius in pixels (1.0 - 5.0)
uniform float u_blurStrength;    // Blend factor (0.0 = no blur, 1.0 = full blur)

// 9-tap Gaussian blur with configurable radius
// Provides smooth, organic edges without destroying detail
void main() {
    vec2 texelSize = 1.0 / u_resolution;
    vec4 center = texture(u_oil_texture, v_texCoord);
    
    // Early out for empty regions
    if (center.a < 0.001) {
        outColor = vec4(0.0);
        return;
    }
    
    // Gaussian weights for 3x3 kernel (sigma ~= 1.0)
    // Can be extended to 5x5 for smoother results
    const float weights[9] = float[9](
        0.0625, 0.125, 0.0625,
        0.125,  0.25,  0.125,
        0.0625, 0.125, 0.0625
    );
    
    const vec2 offsets[9] = vec2[9](
        vec2(-1.0, -1.0), vec2(0.0, -1.0), vec2(1.0, -1.0),
        vec2(-1.0,  0.0), vec2(0.0,  0.0), vec2(1.0,  0.0),
        vec2(-1.0,  1.0), vec2(0.0,  1.0), vec2(1.0,  1.0)
    );
    
    vec4 blurred = vec4(0.0);
    float totalWeight = 0.0;
    
    for (int i = 0; i < 9; i++) {
        vec2 samplePos = v_texCoord + offsets[i] * texelSize * u_blurRadius;
        vec4 sample_val = texture(u_oil_texture, samplePos);
        
        // Weight by both gaussian and sample alpha (preserve edges)
        float w = weights[i] * (0.3 + sample_val.a * 0.7);
        blurred += sample_val * w;
        totalWeight += w;
    }
    
    if (totalWeight > 0.001) {
        blurred /= totalWeight;
    }
    
    // Blend between original and blurred based on strength
    // Also modulate by edge detection - blur more at edges, less at cores
    float edgeFactor = 1.0 - smoothstep(0.3, 0.8, center.a);
    float adaptiveStrength = u_blurStrength * (0.5 + edgeFactor * 0.5);
    
    outColor = mix(center, blurred, adaptiveStrength);
}
