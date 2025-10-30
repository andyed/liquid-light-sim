#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform vec2 u_resolution;

const vec2 center = vec2(0.5, 0.5);
const float containerRadius = 0.48;

void main() {
    float dx = 1.0 / float(textureSize(u_velocity_texture, 0).x);
    float dy = 1.0 / float(textureSize(u_velocity_texture, 0).y);

    float right = texture(u_velocity_texture, v_texCoord + vec2(dx, 0.0)).x;
    float left = texture(u_velocity_texture, v_texCoord - vec2(dx, 0.0)).x;
    float top = texture(u_velocity_texture, v_texCoord + vec2(0.0, dy)).y;
    float bottom = texture(u_velocity_texture, v_texCoord - vec2(0.0, dy)).y;

    float div = 0.5 * (right - left + top - bottom);

    // Aspect-correct inside mask
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 c = v_texCoord - center;
    float dist = length(vec2(c.x * aspect, c.y));
    float inside = step(dist, containerRadius);

    outColor = vec4(div * inside, 0.0, 0.0, 1.0);
}
