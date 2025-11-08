#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_oil_texture;
uniform sampler2D u_curvature_texture;
uniform vec2 u_resolution;
uniform float u_oil_gamma;
uniform float u_tint_strength;
uniform float u_refract_strength;
uniform float u_fresnel_power;
uniform float u_occlusion;

// Thin-film interference for iridescence (soap bubble effect)
vec3 thinFilmInterference(float thickness, float cosTheta) {
    // Optical path difference for thin film
    // thickness in normalized units (0-1 maps to ~100-800nm visible range)
    float opticalPath = thickness * 600.0; // nanometers
    
    // Different wavelengths interfere differently
    float r = sin(opticalPath * 0.015 + 0.0) * 0.5 + 0.5;  // Red ~650nm
    float g = sin(opticalPath * 0.018 + 2.0) * 0.5 + 0.5;  // Green ~550nm
    float b = sin(opticalPath * 0.022 + 4.0) * 0.5 + 0.5;  // Blue ~450nm
    
    // Modulate by viewing angle (Fresnel-like)
    float angleFactor = pow(1.0 - cosTheta, 0.8);
    
    // Much more subtle - reduced from 1.5 to 0.6
    return vec3(r, g, b) * angleFactor * 0.6;
}

// Schlick's approximation for Fresnel reflection
float fresnel(float cosTheta, float ior) {
    float r0 = (ior - 1.0) / (ior + 1.0);
    r0 *= r0;
    return r0 + (1.0 - r0) * pow(1.0 - cosTheta, u_fresnel_power);
}

void main() {
    vec4 oilSample = texture(u_oil_texture, v_texCoord);
    float thickness = oilSample.a;
    vec3 oilTint = oilSample.rgb;
    
    // No oil - pass through
    if (thickness < 0.001) {
        fragColor = vec4(texture(u_scene, v_texCoord).rgb, 1.0);
        return;
    }
    
    // Calculate thickness gradient for surface normal approximation
    vec2 texel = 1.0 / u_resolution;
    float thL = texture(u_oil_texture, v_texCoord + vec2(-texel.x, 0.0)).a;
    float thR = texture(u_oil_texture, v_texCoord + vec2(texel.x, 0.0)).a;
    float thD = texture(u_oil_texture, v_texCoord + vec2(0.0, -texel.y)).a;
    float thU = texture(u_oil_texture, v_texCoord + vec2(0.0, texel.y)).a;
    
    // Gradient = surface normal direction
    vec2 gradient = vec2(thR - thL, thU - thD) * 0.5;
    float gradMag = length(gradient);
    
    // Refraction distortion (chromatic aberration for realism)
    vec2 refractOffset = gradient * u_refract_strength;
    vec3 refracted;
    refracted.r = texture(u_scene, v_texCoord + refractOffset * 1.02).r; // Red bends less
    refracted.g = texture(u_scene, v_texCoord + refractOffset * 1.00).g; // Green baseline
    refracted.b = texture(u_scene, v_texCoord + refractOffset * 0.98).b; // Blue bends more
    
    // Viewing angle for Fresnel (assume viewer looking straight down)
    float cosTheta = 1.0 / (1.0 + gradMag * 10.0); // steeper gradient = more grazing angle
    
    // Thin-film iridescence (rainbow colors from interference)
    vec3 iridescence = thinFilmInterference(thickness * 2.0, cosTheta);
    
    // Fresnel reflection (oil-water interface, IOR ~1.47/1.33 ≈ 1.1)
    float fresnelFactor = fresnel(cosTheta, 1.1);
    
    // Thickness-based opacity and color
    float opacity = clamp(pow(thickness * 1.5, u_oil_gamma), 0.0, 1.0);
    
    // Edge highlighting (oil pools have bright rims)
    float edgeHighlight = smoothstep(0.0, 0.1, gradMag) * 0.3;
    
    // Darken scene under thick oil (occlusion)
    float occlusionFactor = 1.0 - (opacity * u_occlusion);
    
    // Composite layers with user color as PRIMARY:
    // 1. Base scene (refracted and occluded)
    vec3 base = refracted * occlusionFactor;
    
    // 2. User's selected oil color (PRIMARY - this is what they painted!)
    vec3 userOilColor = oilTint;
    vec3 tinted = mix(base, userOilColor, opacity * u_tint_strength * 1.5); // Boost tint visibility
    
    // 3. MINIMAL iridescent highlights (only on extremely thin oil edges)
    // Only show iridescence on very thin films (like real soap bubbles)
    float thinness = smoothstep(0.12, 0.03, thickness); // Only when very thin
    float iridescenceStrength = thinness * 0.02; // Drastically reduced from 0.08
    vec3 withIridescence = tinted + iridescence * iridescenceStrength;
    
    // 4. Fresnel reflection (ONLY on thick oil, fades completely when thin)
    // White reflection ONLY appears on thick oil (> 0.4 thickness)
    float thicknessForReflection = smoothstep(0.3, 0.6, thickness); // Only thick oil gets white
    vec3 reflectionColor = mix(userOilColor * 1.2, vec3(1.0), thicknessForReflection * 0.15); // White only if thick
    float fresnelStrength = fresnelFactor * thicknessForReflection * 0.02; // Tied to thick regions
    vec3 final = mix(withIridescence, reflectionColor, fresnelStrength);
    
    // 5. Edge glow using user's color (ONLY on thick blob edges, not thin spreading)
    float thickEdge = smoothstep(0.35, 0.5, thickness) * edgeHighlight; // Higher threshold
    final += userOilColor * thickEdge * 0.2; // Reduced strength
    
    // Variable density visualization: thicker = darker version of user color
    float densityDarken = smoothstep(0.3, 0.8, thickness) * 0.3;
    final *= (1.0 - densityDarken);
    
    fragColor = vec4(final, 1.0);
}
