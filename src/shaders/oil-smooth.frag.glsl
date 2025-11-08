#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;
uniform float u_smoothingRate;  // 0.0-1.0, strength of smoothing
uniform float u_thicknessThreshold; // Kill dust below this threshold

// Thickness-weighted bilateral smoothing
// Removes pixel dust while preserving droplet boundaries
void main() {
    vec4 center = texture(u_oil_texture, v_texCoord);
    float centerThickness = center.a;
    
    // Kill very thin oil (pixel dust removal)
    if (centerThickness < u_thicknessThreshold) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Smoothing strength inversely proportional to thickness
    // Thin oil = more smoothing (removes noise)
    // Thick oil = less smoothing (preserves detail)
    float thinnessFactor = 1.0 - smoothstep(0.0, 0.15, centerThickness);
    float effectiveSmoothing = u_smoothingRate * thinnessFactor;
    
    if (effectiveSmoothing < 0.01) {
        // No smoothing needed for thick oil
        fragColor = center;
        return;
    }
    
    // 3x3 bilateral filter: smooth color and thickness separately
    vec2 texel = 1.0 / u_resolution;
    
    vec3 colorSum = vec3(0.0);
    float thicknessSum = 0.0;
    float weightSum = 0.0;
    
    // Sample 3x3 neighborhood
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y)) * texel;
            vec4 neighbor = texture(u_oil_texture, v_texCoord + offset);
            float neighborThickness = neighbor.a;
            
            // Spatial weight (Gaussian-ish)
            float spatialDist = length(vec2(x, y));
            float spatialWeight = exp(-spatialDist * spatialDist * 0.5);
            
            // Range weight (preserve edges between thick and thin)
            float thicknessDiff = abs(neighborThickness - centerThickness);
            float rangeWeight = exp(-thicknessDiff * 10.0);
            
            float weight = spatialWeight * rangeWeight;
            
            colorSum += neighbor.rgb * weight;
            thicknessSum += neighborThickness * weight;
            weightSum += weight;
        }
    }
    
    vec3 smoothedColor = colorSum / max(weightSum, 1e-6);
    float smoothedThickness = thicknessSum / max(weightSum, 1e-6);
    
    // Blend between original and smoothed based on effective smoothing
    vec3 finalColor = mix(center.rgb, smoothedColor, effectiveSmoothing);
    float finalThickness = mix(centerThickness, smoothedThickness, effectiveSmoothing);
    
    fragColor = vec4(finalColor, finalThickness);
}
