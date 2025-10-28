#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_pressure_texture;
uniform sampler2D u_velocity_texture;

void main() {
    float dx = 1.0 / float(textureSize(u_pressure_texture, 0).x);
    float dy = 1.0 / float(textureSize(u_pressure_texture, 0).y);

    float right = texture(u_pressure_texture, v_texCoord + vec2(dx, 0.0)).x;
    float left = texture(u_pressure_texture, v_texCoord - vec2(dx, 0.0)).x;
    float top = texture(u_pressure_texture, v_texCoord + vec2(0.0, dy)).x;
    float bottom = texture(u_pressure_texture, v_texCoord - vec2(0.0, dy)).x;

    vec2 gradient = 0.5 * vec2(right - left, top - bottom);
    vec2 velocity = texture(u_velocity_texture, v_texCoord).xy;

    outColor = vec4(velocity - gradient, 0.0, 1.0);
}
