#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_point;
uniform vec3 u_color;
uniform float u_radius;

void main() {
    float d = distance(v_texCoord, u_point);
    vec4 existing = texture(u_texture, v_texCoord);
    
    // Continuous source injection with Gaussian falloff
    float gaussian = exp(-d * d / (u_radius * u_radius * 0.5));
    float sourceStrength = 0.03;
    
    // Calculate how much new ink to add
    vec3 newInk = u_color * gaussian * sourceStrength;
    
    // Get total concentration of existing ink
    float existingConc = length(existing.rgb);
    
    // Only add new ink where there's space (don't mix colors)
    // If existing ink is strong, don't add new ink on top
    float spaceAvailable = max(0.0, 0.8 - existingConc);
    vec3 inkToAdd = newInk * spaceAvailable;
    
    // Final: existing ink + new ink (only in empty space)
    vec3 newConcentration = existing.rgb + inkToAdd;
    
    // Clamp to prevent overflow (important for velocity splatting)
    newConcentration = clamp(newConcentration, vec3(-50000.0), vec3(50000.0));
    
    outColor = vec4(newConcentration, 1.0);
}
