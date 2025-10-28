#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform float u_viscosity;
uniform float u_dt;

void main() {
    vec2 texelSize = 1.0 / vec2(textureSize(u_velocity_texture, 0));
    
    vec2 velocity = texture(u_velocity_texture, v_texCoord).xy;
    vec2 left = texture(u_velocity_texture, v_texCoord - vec2(texelSize.x, 0.0)).xy;
    vec2 right = texture(u_velocity_texture, v_texCoord + vec2(texelSize.x, 0.0)).xy;
    vec2 top = texture(u_velocity_texture, v_texCoord + vec2(0.0, texelSize.y)).xy;
    vec2 bottom = texture(u_velocity_texture, v_texCoord - vec2(0.0, texelSize.y)).xy;
    
    // Laplacian of velocity (diffusion of momentum = viscosity)
    vec2 laplacian = left + right + top + bottom - 4.0 * velocity;
    
    // Apply viscosity: velocity += viscosity * dt * laplacian(velocity)
    vec2 newVelocity = velocity + u_viscosity * u_dt * laplacian;
    
    outColor = vec4(newVelocity, 0.0, 0.0);
}
