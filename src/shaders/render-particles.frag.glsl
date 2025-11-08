#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_grid_oil;      // Existing grid oil
uniform vec2 u_particlePos;        // Particle position [0,1]
uniform float u_particleRadius;    // Particle radius
uniform vec3 u_particleColor;      // Particle color (RGB)
uniform float u_particleThickness; // Particle thickness/alpha

// Renders a single particle as a soft circle, composited with grid oil
void main() {
    // Get existing grid oil
    vec4 gridOil = texture(u_grid_oil, v_texCoord);
    
    // Distance from particle center
    float dist = distance(v_texCoord, u_particlePos);
    
    // Soft circle falloff
    float radius = u_particleRadius;
    float softness = 0.3; // Soft edge
    float particleAlpha = smoothstep(radius + softness, radius - softness, dist) * u_particleThickness;
    
    // Composite particle over grid
    vec3 finalColor = mix(gridOil.rgb, u_particleColor, particleAlpha);
    float finalThickness = max(gridOil.a, particleAlpha);
    
    outColor = vec4(finalColor, finalThickness);
}
