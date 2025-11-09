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
    
    // Softer falloff to prevent "pixel eating" at the edges of blobs.
    // This creates a smooth, anti-aliased edge instead of a sharp, noisy one.
    float finalAlpha = smoothstep(u_blobThreshold * 0.7, u_blobThreshold * 1.2, thickness);

    if (finalAlpha < 0.001) {
        outColor = vec4(0.0);
        return;
    }
    
    // The neighborhood sampling for color blending is complex and might not be
    // necessary if we are just fixing the shape. For now, we will simplify
    // and just use the center color, as the main issue is the alpha channel.
    vec3 finalColor = color;
    
    outColor = vec4(finalColor, finalAlpha);
}
