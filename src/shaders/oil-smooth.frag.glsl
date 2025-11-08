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
    // Thin oil = AGGRESSIVE smoothing (removes noise)
    // Thick oil = less smoothing (preserves detail)
    // Wider range (0.0-0.20) and squared for more aggressive thinning
    float thinnessFactor = 1.0 - smoothstep(0.0, 0.20, centerThickness);
    thinnessFactor = thinnessFactor * thinnessFactor; // Square for stronger effect on thin areas
    float effectiveSmoothing = u_smoothingRate * thinnessFactor;
    
    if (effectiveSmoothing < 0.01) {
        // No smoothing needed for thick oil
        fragColor = center;
        return;
    }
    
    // 5x5 bilateral filter: aggressive smoothing for pixel dust removal
    vec2 texel = 1.0 / u_resolution;
    
    vec3 colorSum = vec3(0.0);
    float thicknessSum = 0.0;
    float weightSum = 0.0;
    
    // Sample 5x5 neighborhood (more aggressive smoothing)
    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            vec2 offset = vec2(float(x), float(y)) * texel;
            vec4 neighbor = texture(u_oil_texture, v_texCoord + offset);
            float neighborThickness = neighbor.a;
            
            // Spatial weight (Gaussian-ish, broader for 5x5)
            float spatialDist = length(vec2(x, y));
            float spatialWeight = exp(-spatialDist * spatialDist * 0.3); // Broader than 3x3
            
            // Range weight (preserve edges between thick and thin)
            float thicknessDiff = abs(neighborThickness - centerThickness);
            float rangeWeight = exp(-thicknessDiff * 8.0); // Slightly more permissive
            
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
