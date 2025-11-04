#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oilTexture;
uniform float u_attractionStrength;
uniform vec2 u_resolution;

void main() {
    vec4 oil = texture(u_oilTexture, v_texCoord);
    float thickness = oil.a;

    if (thickness < 0.001) {
        fragColor = oil;
        return;
    }

    vec2 texel = 1.0 / u_resolution;
    vec4 blurred_oil = vec4(0.0);
    float total_weight = 0.0;

    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            vec2 offset = vec2(float(x), float(y)) * texel;
            vec4 neighbor_oil = texture(u_oilTexture, v_texCoord + offset);
            float weight = 1.0;
            blurred_oil += neighbor_oil * weight;
            total_weight += weight;
        }
    }

    blurred_oil /= total_weight;

    vec2 center_of_mass = vec2(0.5, 0.5); // for now, just use the center of the screen
    vec2 dir = center_of_mass - v_texCoord;
    float dist = length(dir);

    if (dist > 0.0) {
        dir /= dist;
    }

    float force = u_attractionStrength * (1.0 - dist);

    blurred_oil.a += force;

    fragColor = blurred_oil;
}