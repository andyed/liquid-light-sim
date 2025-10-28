#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_point;
uniform vec3 u_color;
uniform float u_radius;

void main() {
    float d = distance(v_texCoord, u_point);
    vec4 existing = texture(u_texture, v_texCoord);
    
    // Continuous source injection with Gaussian falloff
    // Models a point source adding concentration to the field
    float gaussian = exp(-d * d / (u_radius * u_radius * 0.5));
    float sourceStrength = 0.015; // Gentle continuous injection
    
    // Add to concentration field (passive scalar)
    // This is the proper physics: ∂φ/∂t = source + advection + diffusion
    vec3 newConcentration = existing.rgb + u_color * gaussian * sourceStrength;
    
    // Cap at 0.8 to preserve color information (prevents pure white)
    // When it spreads, it will thin from bright cyan to faint cyan
    newConcentration = min(newConcentration, u_color * 0.8);
    
    outColor = vec4(newConcentration, 1.0);
}
