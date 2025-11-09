#version 300 es
// sph-particle-splat.vert.glsl
// Vertex shader for SPH particle splatting
// Each particle is rendered as a point, then expanded in fragment shader

precision highp float;

// Per-particle attributes (from particle buffer)
in vec2 a_position;      // World-space position
in vec3 a_color;         // RGB color
in float a_density;      // Particle density (for size modulation)

// Uniforms
uniform vec2 u_resolution;        // Canvas size
uniform float u_containerRadius;  // World-space container radius
uniform float u_particleRadius;   // Base particle render radius

// Outputs to fragment shader
out vec3 v_color;
out float v_density;
out vec2 v_worldPos;

void main() {
    // Pass world position to fragment shader
    v_worldPos = a_position;
    
    // Convert world coords to normalized device coords
    // World space: [-containerRadius, +containerRadius]
    // NDC space: [-1, +1]
    // NOTE: Flip Y because our rendering has inverted Y-axis
    vec2 ndc = vec2(a_position.x / u_containerRadius, -a_position.y / u_containerRadius);
    
    // Output position
    gl_Position = vec4(ndc, 0.0, 1.0);
    
    // Point size (in pixels) - larger for denser particles
    float densityFactor = clamp(a_density / 1000.0, 0.5, 2.0);
    gl_PointSize = u_particleRadius * densityFactor;
    
    // Pass through to fragment shader
    v_color = a_color;
    v_density = a_density;
}
