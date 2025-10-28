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
    
    if (d < u_radius) {
        // Smooth falloff from center to edge
        float alpha = smoothstep(u_radius, 0.0, d) * 0.5; // Reduced intensity
        
        // Mix instead of add to prevent oversaturation
        vec3 blended = mix(existing.rgb, u_color, alpha);
        outColor = vec4(blended, 1.0);
    } else {
        outColor = existing;
    }
}
