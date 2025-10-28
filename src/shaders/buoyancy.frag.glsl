#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform sampler2D u_phase_texture;
uniform float u_dt;
uniform float u_density_difference;
uniform vec2 u_gravity;

void main() {
    vec2 velocity = texture(u_velocity_texture, v_texCoord).xy;
    float phase = texture(u_phase_texture, v_texCoord).x;

    // Buoyancy force is proportional to the phase difference and gravity
    vec2 buoyancy_force = u_density_difference * phase * u_gravity;

    outColor = vec4(velocity + buoyancy_force * u_dt, 0.0, 0.0);
}
