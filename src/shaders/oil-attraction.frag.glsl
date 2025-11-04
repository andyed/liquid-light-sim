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

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * texel;
            vec4 neighbor_oil = texture(u_oilTexture, v_texCoord + offset);
            float weight = 1.0;
            blurred_oil += neighbor_oil * weight;
            total_weight += weight;
        }
    }

    blurred_oil /= total_weight;

    // Calculate the gradient of the blurred oil thickness
    float blurred_thL = texture(u_oilTexture, v_texCoord + vec2(-texel.x, 0.0)).a;
    float blurred_thR = texture(u_oilTexture, v_texCoord + vec2(texel.x, 0.0)).a;
    float blurred_thD = texture(u_oilTexture, v_texCoord + vec2(0.0, -texel.y)).a;
    float blurred_thU = texture(u_oilTexture, v_texCoord + vec2(0.0, texel.y)).a;

    vec2 grad = vec2(blurred_thR - blurred_thL, blurred_thU - blurred_thD) * 0.5;

    // Apply a force in the direction of the gradient
    vec2 force = normalize(grad) * u_attractionStrength;

    blurred_oil.a += length(force);

    fragColor = blurred_oil;
}