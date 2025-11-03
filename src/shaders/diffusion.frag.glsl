#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform float u_diffusion_rate;
uniform float u_dt;
uniform bool u_preserveAlpha; // For oil: smooth RGB only, preserve thickness in alpha

void main() {
    vec4 center = texture(u_texture, v_texCoord);
    vec4 left = texture(u_texture, v_texCoord - vec2(1.0 / float(textureSize(u_texture, 0).x), 0.0));
    vec4 right = texture(u_texture, v_texCoord + vec2(1.0 / float(textureSize(u_texture, 0).x), 0.0));
    vec4 top = texture(u_texture, v_texCoord + vec2(0.0, 1.0 / float(textureSize(u_texture, 0).y)));
    vec4 bottom = texture(u_texture, v_texCoord - vec2(0.0, 1.0 / float(textureSize(u_texture, 0).y)));

    vec4 diffused = center + u_diffusion_rate * u_dt * (left + right + top + bottom - 4.0 * center);
    
    // For oil smoothing: only smooth RGB tint, preserve alpha thickness
    if (u_preserveAlpha) {
        outColor = vec4(diffused.rgb, center.a);
    } else {
        outColor = diffused;
    }
}
