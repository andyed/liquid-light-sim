#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_oil_texture;  // RGBA: rgb=tint, a=thickness
uniform vec2 u_resolution;
uniform float u_edgeSharpness;  // How sharply to define oil/water boundary

// Edge sharpening creates a distinct "border layer" for oil droplets
// Steepens thickness gradients to create clean blob boundaries
void main() {
    vec4 oil = texture(u_oil_texture, v_texCoord);
    float thickness = oil.a;
    vec3 tint = oil.rgb;
    
    if (thickness < 0.001) {
        outColor = vec4(tint, 0.0);
        return;
    }
    
    vec2 texelSize = 1.0 / u_resolution;
    
    // Sample neighbors to detect edges
    float left = texture(u_oil_texture, v_texCoord + vec2(-texelSize.x, 0.0)).a;
    float right = texture(u_oil_texture, v_texCoord + vec2(texelSize.x, 0.0)).a;
    float up = texture(u_oil_texture, v_texCoord + vec2(0.0, texelSize.y)).a;
    float down = texture(u_oil_texture, v_texCoord + vec2(0.0, -texelSize.y)).a;
    
    // Average neighbor thickness
    float avgNeighbor = (left + right + up + down) * 0.25;
    
    // Detect if we're at an edge (thickness gradient)
    float gradient = abs(thickness - avgNeighbor);
    
    // If we're at an edge, sharpen it
    if (gradient > 0.01) {
        // Inside the blob (thicker than average) → push thicker
        if (thickness > avgNeighbor) {
            thickness = mix(thickness, 1.0, u_edgeSharpness * gradient * 10.0);
        } 
        // Outside the blob (thinner than average) → push thinner
        else {
            thickness = mix(thickness, 0.0, u_edgeSharpness * gradient * 10.0);
        }
    }
    
    // Also detect isolated pixels (dust)
    float maxNeighbor = max(max(left, right), max(up, down));
    if (thickness < 0.15 && maxNeighbor < 0.15) {
        // Isolated thin oil → eliminate
        thickness = 0.0;
    }
    
    outColor = vec4(tint, thickness);
}
