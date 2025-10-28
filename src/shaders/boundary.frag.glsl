#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_thickness;

void main() {
    vec4 color = texture(u_texture, v_texCoord);
    
    // Distance from center
    float dist = distance(v_texCoord, u_center);
    
    // Draw circular boundary
    float edge = abs(dist - u_radius);
    if (edge < u_thickness) {
        // Smooth boundary line
        float alpha = smoothstep(u_thickness, 0.0, edge);
        vec3 boundaryColor = vec3(0.3, 0.3, 0.3); // Gray boundary
        color.rgb = mix(color.rgb, boundaryColor, alpha * 0.7);
    }
    
    // Darken outside the circle
    if (dist > u_radius) {
        color.rgb *= 0.1; // Very dark outside
    }
    
    outColor = color;
}
