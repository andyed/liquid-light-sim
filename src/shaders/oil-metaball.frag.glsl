#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;
uniform float u_blobThreshold;    // Thickness threshold for blob detection
uniform float u_metaballRadius;   // Influence radius for metaball blending
uniform float u_bulginess;        // Controls how much blobs bulge when merging (1.0-3.0)

// MetaBall implicit surface function
// Samples surrounding oil and creates smooth blending field
void main() {
    vec4 oil = texture(u_oil_texture, v_texCoord);
    float thickness = oil.a;
    vec3 color = oil.rgb;
    
    // ULTRA-SHARP threshold cutoff to eliminate dust
    // Almost binary cutoff with minimal fade
    float thresholdFade = smoothstep(u_blobThreshold * 0.98, u_blobThreshold * 1.02, thickness);
    
    if (thresholdFade < 0.05) {
        // Below threshold - CULL THE DUST (raised from 0.01 for harder cut)
        outColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    // Sample surrounding oil to create implicit surface field
    vec2 texelSize = 1.0 / u_resolution;
    float field = 0.0;
    vec3 blendedColor = vec3(0.0);
    float totalWeight = 0.0;
    
    // Circular sampling for isotropic influence
    const int SAMPLES = 8;
    for (int i = 0; i < SAMPLES; i++) {
        float angle = float(i) * 6.2832 / float(SAMPLES);
        vec2 dir = vec2(cos(angle), sin(angle));
        
        for (float r = 1.0; r <= u_metaballRadius; r += 1.0) {
            vec2 samplePos = v_texCoord + dir * r * texelSize;
            vec4 neighbor = texture(u_oil_texture, samplePos);
            float neighborThickness = neighbor.a;
            
            if (neighborThickness > u_blobThreshold) {
                // Metaball contribution: 1/r^bulginess
                // Higher bulginess = more exaggerated bulging at merge points
                float contribution = neighborThickness / pow(r, u_bulginess);
                field += contribution;
                blendedColor += neighbor.rgb * contribution;
                totalWeight += contribution;
            }
        }
    }
    
    // Add center contribution
    field += thickness;
    blendedColor += color * thickness;
    totalWeight += thickness;
    
    // Normalize
    if (totalWeight > 0.0) {
        blendedColor /= totalWeight;
    }
    
    // Blend between original and metaball result based on threshold fade
    // This eliminates hard edges and flickering near threshold
    vec3 finalColor = mix(color, blendedColor, thresholdFade);
    
    // IMPORTANT: Fade alpha with threshold to create clean edges (no dust corona)
    // Below threshold = transparent, above = opaque
    float finalAlpha = thickness * thresholdFade;
    outColor = vec4(finalColor, finalAlpha);
}
