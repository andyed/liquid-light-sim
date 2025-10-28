#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_color_texture;
uniform sampler2D u_velocity_texture;
uniform float u_spread_strength;

void main() {
    vec2 texelSize = 1.0 / vec2(textureSize(u_color_texture, 0));
    
    // Sample local color concentration (luminance as proxy for ink density)
    vec4 center = texture(u_color_texture, v_texCoord);
    float centerConcentration = dot(center.rgb, vec3(0.299, 0.587, 0.114)); // Luminance
    
    // Sample neighbors
    vec4 left = texture(u_color_texture, v_texCoord - vec2(texelSize.x, 0.0));
    vec4 right = texture(u_color_texture, v_texCoord + vec2(texelSize.x, 0.0));
    vec4 top = texture(u_color_texture, v_texCoord + vec2(0.0, texelSize.y));
    vec4 bottom = texture(u_color_texture, v_texCoord - vec2(0.0, texelSize.y));
    
    float leftConc = dot(left.rgb, vec3(0.299, 0.587, 0.114));
    float rightConc = dot(right.rgb, vec3(0.299, 0.587, 0.114));
    float topConc = dot(top.rgb, vec3(0.299, 0.587, 0.114));
    float bottomConc = dot(bottom.rgb, vec3(0.299, 0.587, 0.114));
    
    // Calculate pressure gradient (high concentration = high pressure)
    // Fluid flows from high to low pressure
    vec2 pressureGradient = vec2(
        (leftConc - rightConc),   // Push away from high concentration
        (bottomConc - topConc)
    );
    
    // Add spreading force to velocity
    vec2 velocity = texture(u_velocity_texture, v_texCoord).xy;
    vec2 spreadForce = pressureGradient * u_spread_strength * centerConcentration;
    
    outColor = vec4(velocity + spreadForce, 0.0, 0.0);
}
