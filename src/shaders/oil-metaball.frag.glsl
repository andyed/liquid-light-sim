#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;
uniform float u_blobThreshold;    // Thickness threshold for blob detection
uniform float u_metaballRadius;   // Influence radius for metaball blending
uniform float u_bulginess;        // Controls how much blobs bulge when merging (1.0-3.0)

// Soft polynomial falloff (smoother than 1/r^n)
float softFalloff(float r, float maxR) {
    float t = clamp(r / maxR, 0.0, 1.0);
    // Quintic ease-out: very smooth at edges
    float inv = 1.0 - t;
    return inv * inv * inv * (t * (6.0 * t - 15.0) + 10.0);
}

// MetaBall implicit surface function with smooth organic edges
void main() {
    vec4 oil = texture(u_oil_texture, v_texCoord);
    float thickness = oil.a;
    vec3 color = oil.rgb;
    
    vec2 texelSize = 1.0 / u_resolution;
    
    // Accumulate field contributions from neighbors
    float field = 0.0;
    vec3 blendedColor = vec3(0.0);
    float totalWeight = 0.0;
    
    // Wider sampling with more directions for smoother results
    const int SAMPLES = 12;
    const int RINGS = 3;  // Sample at multiple radii per direction
    
    for (int i = 0; i < SAMPLES; i++) {
        float angle = float(i) * 6.2832 / float(SAMPLES);
        vec2 dir = vec2(cos(angle), sin(angle));
        
        for (int ring = 1; ring <= RINGS; ring++) {
            // Non-linear radius distribution (denser near center)
            float r = float(ring) * u_metaballRadius / float(RINGS);
            vec2 samplePos = v_texCoord + dir * r * texelSize;
            vec4 neighbor = texture(u_oil_texture, samplePos);
            float neighborThickness = neighbor.a;
            
            // Soft distance-based weight (no hard threshold)
            float distWeight = softFalloff(r, u_metaballRadius);
            
            // Thickness contributes to field with distance falloff
            float contribution = neighborThickness * distWeight;
            field += contribution;
            blendedColor += neighbor.rgb * contribution;
            totalWeight += contribution;
        }
    }
    
    // Add center contribution (strongest)
    float centerWeight = 1.5; // Boost center to maintain blob cores
    field += thickness * centerWeight;
    blendedColor += color * thickness * centerWeight;
    totalWeight += thickness * centerWeight;
    
    // Normalize color
    if (totalWeight > 0.001) {
        blendedColor /= totalWeight;
    } else {
        outColor = vec4(0.0);
        return;
    }
    
    // Normalize field to roughly [0, 1] range
    float normalizedField = field / (centerWeight + float(SAMPLES * RINGS) * 0.3);
    
    // SOFT ALPHA: Use power curve instead of hard threshold
    // This creates smooth, anti-aliased edges
    float softThreshold = u_blobThreshold * 0.5;
    float edgeWidth = u_blobThreshold * 0.8; // Wide transition zone
    
    // Smooth hermite interpolation for edge
    float edge = smoothstep(softThreshold - edgeWidth, softThreshold + edgeWidth, normalizedField);
    
    // Additional softening: power curve for more organic falloff
    float organicAlpha = pow(edge, 0.7); // <1 = softer edges, >1 = sharper
    
    // Thickness also contributes to alpha (thicker = more opaque)
    float thicknessAlpha = smoothstep(0.0, u_blobThreshold * 2.0, normalizedField);
    
    // Combine: organic edge shape with thickness-based opacity
    float finalAlpha = organicAlpha * thicknessAlpha;
    finalAlpha = clamp(finalAlpha, 0.0, 1.0);
    
    // Early out for nearly invisible pixels
    if (finalAlpha < 0.005) {
        outColor = vec4(0.0);
        return;
    }
    
    outColor = vec4(blendedColor, finalAlpha);
}
