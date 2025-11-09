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
    
    // Use a power function to "fatten" the blob and create a smoother, more organic edge.
    // This makes lower thickness values contribute more to the alpha, reducing pixelation.
    float alpha = thickness / u_blobThreshold; // Normalize thickness relative to threshold
    float finalAlpha = pow(alpha, 0.5); // Apply power function (square root) for softening

    // Clamp to 0-1 and apply a final smoothstep to ensure clean cutoff below threshold
    finalAlpha = smoothstep(0.0, 1.0, finalAlpha); // Ensure smooth transition from 0 to 1

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
