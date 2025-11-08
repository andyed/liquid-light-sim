#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_oil_texture;
uniform vec2 u_center;  // Center of region to clear
uniform float u_radius; // Radius to clear

// Clears a circular region (for particle conversion)
void main() {
    vec4 oil = texture(u_oil_texture, v_texCoord);
    
    float dist = distance(v_texCoord, u_center);
    
    if (dist < u_radius) {
        // Clear this region (particle took it)
        outColor = vec4(oil.rgb, 0.0); // Keep color, zero thickness
    } else {
        outColor = oil;
    }
}
