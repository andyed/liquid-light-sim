#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_distortionStrength; // 0.0 = off, 0.1 = subtle, 0.5 = strong
uniform float u_smoothingStrength; // 0.0 = off, 0.5 = subtle, 1.0 = strong

// Simplex noise for organic distortion
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    vec2 uv = v_texCoord;
    
    // Organic flow distortion
    if (u_distortionStrength > 0.0) {
        // Multi-scale noise for natural flow
        float noise1 = snoise(uv * 3.0 + u_time * 0.1);
        float noise2 = snoise(uv * 7.0 - u_time * 0.15);
        float noise3 = snoise(uv * 15.0 + u_time * 0.2);
        
        // Combine scales for organic distortion
        vec2 distortion = vec2(
            noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2,
            noise2 * 0.5 + noise3 * 0.3 + noise1 * 0.2
        );
        
        // Apply distortion (breaks up straight lines)
        uv += distortion * u_distortionStrength * 0.01;
    }
    
    // Sample with distorted coordinates
    vec4 color = texture(u_texture, uv);
    
    // Bilateral blur: smooth colors while preserving edges
    if (u_smoothingStrength > 0.0) {
        vec2 texel = 1.0 / u_resolution;
        vec4 smoothed = vec4(0.0);
        float totalWeight = 0.0;
        
        // 5x5 kernel for better smoothing
        for (int x = -2; x <= 2; x++) {
            for (int y = -2; y <= 2; y++) {
                vec2 offset = vec2(x, y) * texel;
                vec4 sampleColor = texture(u_texture, uv + offset);
                
                // Spatial weight (Gaussian)
                float spatialWeight = exp(-float(x*x + y*y) / 8.0);
                
                // Color weight (preserve edges)
                float colorDiff = length(sampleColor.rgb - color.rgb);
                float colorWeight = exp(-colorDiff * colorDiff * 10.0);
                
                float weight = spatialWeight * colorWeight;
                smoothed += sampleColor * weight;
                totalWeight += weight;
            }
        }
        
        smoothed /= totalWeight;
        color = mix(color, smoothed, u_smoothingStrength);
    }
    
    // Optional: Subtle glow for more organic feel
    vec2 texel = 1.0 / u_resolution;
    vec4 glow = vec4(0.0);
    float glowStrength = 0.3;
    
    // 3x3 blur for glow
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            glow += texture(u_texture, uv + vec2(x, y) * texel * 2.0);
        }
    }
    glow /= 9.0;
    
    // Blend original with glow
    color = mix(color, glow, glowStrength * 0.3);
    
    // Boost saturation for more vibrant look
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(luminance), color.rgb, 1.2);
    
    outColor = color;
}
