#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform float u_confinement_strength;
uniform vec2 u_resolution;

void main() {
    vec2 texel = 1.0 / u_resolution;
    
    // Sample velocity field in 3x3 neighborhood
    vec2 vL = texture(u_velocity_texture, v_texCoord - vec2(texel.x, 0.0)).xy;
    vec2 vR = texture(u_velocity_texture, v_texCoord + vec2(texel.x, 0.0)).xy;
    vec2 vB = texture(u_velocity_texture, v_texCoord - vec2(0.0, texel.y)).xy;
    vec2 vT = texture(u_velocity_texture, v_texCoord + vec2(0.0, texel.y)).xy;
    vec2 vC = texture(u_velocity_texture, v_texCoord).xy;
    
    // Compute vorticity (curl of velocity field)
    // ω = ∂v/∂x - ∂u/∂y (scalar in 2D)
    float vorticity = (vR.y - vL.y) * 0.5 - (vT.x - vB.x) * 0.5;
    
    // Compute gradient of vorticity magnitude
    float omegaL = abs((texture(u_velocity_texture, v_texCoord - vec2(texel.x, 0.0)).y - 
                        texture(u_velocity_texture, v_texCoord - vec2(texel.x * 2.0, 0.0)).y) * 0.5 -
                       (texture(u_velocity_texture, v_texCoord - vec2(texel.x, texel.y)).x - 
                        texture(u_velocity_texture, v_texCoord - vec2(texel.x, -texel.y)).x) * 0.5);
    
    float omegaR = abs((texture(u_velocity_texture, v_texCoord + vec2(texel.x * 2.0, 0.0)).y - 
                        texture(u_velocity_texture, v_texCoord).y) * 0.5 -
                       (texture(u_velocity_texture, v_texCoord + vec2(texel.x, texel.y)).x - 
                        texture(u_velocity_texture, v_texCoord + vec2(texel.x, -texel.y)).x) * 0.5);
    
    float omegaB = abs((texture(u_velocity_texture, v_texCoord - vec2(0.0, texel.y)).y - 
                        texture(u_velocity_texture, v_texCoord - vec2(texel.x, texel.y)).y) * 0.5 -
                       (texture(u_velocity_texture, v_texCoord - vec2(0.0, texel.y * 2.0)).x - 
                        texture(u_velocity_texture, v_texCoord).x) * 0.5);
    
    float omegaT = abs((texture(u_velocity_texture, v_texCoord + vec2(texel.x, texel.y)).y - 
                        texture(u_velocity_texture, v_texCoord + vec2(0.0, texel.y)).y) * 0.5 -
                       (texture(u_velocity_texture, v_texCoord).x - 
                        texture(u_velocity_texture, v_texCoord + vec2(0.0, texel.y * 2.0)).x) * 0.5);
    
    // Gradient of vorticity magnitude
    vec2 eta = vec2((omegaR - omegaL) * 0.5, (omegaT - omegaB) * 0.5);
    
    // Normalize eta (direction of vorticity gradient)
    float etaLength = length(eta);
    if (etaLength > 0.0001) {
        eta = eta / etaLength;
        
        // Confinement force: N × ω (perpendicular to gradient, scaled by vorticity)
        // N is the normalized gradient direction
        // Force direction is perpendicular: (-eta.y, eta.x)
        vec2 force = vec2(-eta.y, eta.x) * vorticity * u_confinement_strength;
        
        // Add force to velocity
        vec2 newVelocity = vC + force;
        outColor = vec4(newVelocity, 0.0, 0.0);
    } else {
        // No gradient, no confinement
        outColor = vec4(vC, 0.0, 0.0);
    }
}
