#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_color_texture;
uniform float u_absorption_coefficient;
uniform vec3 u_light_color; // Colored light source (RGB rotation)

// Volumetric rendering with colored light
// Ink absorbs and scatters the colored light

void main() {
    // Sample concentration field (RGB color + concentration)
    vec4 concentration = texture(u_color_texture, v_texCoord);
    
    // Calculate total concentration (how much ink is here)
    float totalConc = length(concentration.rgb);
    
    if (totalConc < 0.001) {
        // No ink - pure black background
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // Normalized color direction (what color is the ink)
    vec3 inkColor = concentration.rgb / max(totalConc, 0.001);
    
    // Beer-Lambert: Opacity increases with concentration
    // But we want it to glow, not just block light
    float opacity = 1.0 - exp(-u_absorption_coefficient * totalConc);
    
    // Ink's inherent color (always visible)
    vec3 inkBase = inkColor * opacity * 1.5; // Boost base brightness
    
    // Add colored light as ADDITIVE component (doesn't change ink color)
    // Only add light if it's not black (light rotation is active)
    float lightStrength = length(u_light_color);
    vec3 lightContribution = u_light_color * opacity * 0.8 * lightStrength; // Stronger light
    
    // Final color: Ink's own color + additive colored light
    vec3 finalColor = inkBase + lightContribution;
    
    // Boost saturation for vivid colors
    float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
    vec3 saturated = mix(vec3(luminance), finalColor, 1.4);
    
    outColor = vec4(saturated, 1.0);
}
