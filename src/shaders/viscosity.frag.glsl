#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform float u_viscosity;
uniform float u_dt;
uniform vec2 u_resolution;

const vec2 center = vec2(0.5, 0.5);
const float containerRadius = 0.48;

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

    // Aspect-correct inside mask
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 c = v_texCoord - center;
    float dist = length(vec2(c.x * aspect, c.y));
    float inside = step(dist, containerRadius);
    
    outColor = vec4(newVelocity * inside, 0.0, 0.0);
}
