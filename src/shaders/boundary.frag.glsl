#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_thickness;
uniform vec2 u_resolution; // canvas size in pixels

void main() {
    vec4 color = texture(u_texture, v_texCoord);
    
    // Aspect-correct distance from center so the ring stays circular
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 d = v_texCoord - u_center;
    float dist = length(vec2(d.x * aspect, d.y));
    
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
