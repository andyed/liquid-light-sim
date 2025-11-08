#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform sampler2D u_oil_texture;  // RGBA: rgb=tint, a=thickness
uniform float u_dt;
uniform float u_buoyancy_strength;  // Material-specific buoyancy (negative for lighter-than-water)
uniform vec2 u_gravity;  // Default: (0.0, 1.0) pointing down

void main() {
    vec2 velocity = texture(u_velocity_texture, v_texCoord).xy;
    vec4 oil = texture(u_oil_texture, v_texCoord);
    float oilThickness = oil.a;

    // Buoyancy force: lighter oils rise (negative gravity direction)
    // Force proportional to oil thickness (more oil = more buoyancy)
    vec2 buoyancy_force = u_buoyancy_strength * oilThickness * u_gravity;

    // Add buoyancy to velocity
    vec2 newVelocity = velocity + buoyancy_force * u_dt;

    outColor = vec4(newVelocity, 0.0, 0.0);
}
