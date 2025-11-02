#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oil_texture;
uniform sampler2D u_curvature_texture;
uniform float u_surface_tension;
uniform float u_dt;

void main() {
    vec4 oil = texture(u_oil_texture, v_texCoord);
    float laplacian = texture(u_curvature_texture, v_texCoord).r; // Laplacian is in the R channel

    // Apply a force proportional to the Laplacian
    // This will move oil from areas of high curvature to areas of low curvature
    // Effectively smoothing the surface and creating blobby shapes
    float thickness = oil.a;
    oil.a += laplacian * u_surface_tension * u_dt * smoothstep(0.0, 0.5, thickness);

    fragColor = oil;
}