#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_color_texture;
uniform sampler2D u_velocity_texture;
uniform float u_dt;
uniform vec2 u_resolution;

void main() {
    // Circular container boundary
    const vec2 center = vec2(0.5, 0.5);
    const float containerRadius = 0.48;
    
    vec2 velocity = texture(u_velocity_texture, v_texCoord).xy;
    vec2 coord = v_texCoord - velocity * u_dt / u_resolution;
    
    // Clamp to circular boundary
    vec2 toCenter = coord - center;
    float dist = length(toCenter);
    if (dist > containerRadius) {
        coord = center + normalize(toCenter) * containerRadius;
    }
    
    outColor = texture(u_color_texture, coord);
}
