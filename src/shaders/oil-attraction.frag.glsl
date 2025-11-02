#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;
uniform float u_attraction_strength;
uniform float u_dt;

void main() {
    vec4 oil = texture(u_oil_texture, v_texCoord);
    float thickness = oil.a;

    if (thickness > 0.01) {
        // This is a simplified approach. A real center of mass would require a multi-pass reduction.
        // Instead, we'll create a force that pulls towards the center of the screen, but only where there is oil.
        // This will have a similar effect of keeping blobs from straying too far.
        vec2 to_center = (0.5 - v_texCoord) * u_attraction_strength;
        oil.a += dot(to_center, to_center) * u_dt;
    }

    fragColor = oil;
}
