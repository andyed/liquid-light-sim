#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_oil_texture;  // RGBA: rgb=tint, a=thickness
uniform vec2 u_resolution;
uniform float u_cohesionStrength;  // How strongly thin oil is pulled toward thick blobs
uniform float u_absorptionThreshold;  // Oil thinner than this gets absorbed by neighbors

// Cohesion force: oil molecules want to stick together
// Thin oil is pulled toward nearby thick blobs, preventing dust formation
void main() {
    vec4 oil = texture(u_oil_texture, v_texCoord);
    float thickness = oil.a;
    vec3 tint = oil.rgb;
    
    // Only apply cohesion to thin oil (thick blobs are stable)
    if (thickness < u_absorptionThreshold) {
        // Find the direction toward the nearest thick oil blob
        vec2 texelSize = 1.0 / u_resolution;
        vec2 cohesionDir = vec2(0.0);
        float totalWeight = 0.0;
        
        // Circular search pattern to avoid directional bias
        const int SAMPLES = 16;
        const float RADIUS = 5.0;
        
        for (int i = 0; i < SAMPLES; i++) {
            float angle = float(i) * 6.2832 / float(SAMPLES); // 2*PI
            vec2 dir = vec2(cos(angle), sin(angle));
            
            // Sample at multiple radii
            for (float r = 1.0; r <= RADIUS; r += 1.0) {
                vec2 offset = dir * r * texelSize;
                vec4 neighbor = texture(u_oil_texture, v_texCoord + offset);
                float neighborThickness = neighbor.a;
                
                // Only thick oil attracts
                if (neighborThickness > u_absorptionThreshold * 2.0) {
                    // Stronger pull from closer thick blobs
                    float weight = neighborThickness / (r * r + 0.1);
                    cohesionDir += dir * r * weight;
                    totalWeight += weight;
                }
            }
        }
        
        if (totalWeight > 0.001) {
            // Normalize direction
            cohesionDir /= totalWeight;
            vec2 pullDir = normalize(cohesionDir) * texelSize;
            
            // Sample oil in the pull direction
            vec4 targetOil = texture(u_oil_texture, v_texCoord + pullDir * u_cohesionStrength);
            
            // Transfer this oil's thickness to the target location
            // (effectively moves oil toward blobs)
            if (targetOil.a > thickness) {
                // Reduce local thickness (oil moves away)
                thickness *= 0.85;
                // Blend tint toward target
                tint = mix(tint, targetOil.rgb, 0.3);
            }
        } else {
            // No thick oil nearby - very thin oil just disappears (kills dust)
            if (thickness < u_absorptionThreshold * 0.5) {
                thickness = 0.0;
            }
        }
    }
    
    outColor = vec4(tint, thickness);
}
