#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_color_texture;
uniform sampler2D u_velocity_texture;
uniform float u_dt;
uniform vec2 u_resolution;
uniform int u_isVelocity; // 1 when advecting velocity, 0 when advecting color

// Circular container boundary (aspect-correct)
const vec2 center = vec2(0.5, 0.5);
const float containerRadius = 0.48;

vec2 clampToCircle(vec2 coord) {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 r = coord - center;
    vec2 r_as = vec2(r.x * aspect, r.y);
    float d = length(r_as);
    
    // Smooth falloff near boundary instead of hard snap
    float softEdge = 0.015; // blend zone width (balance smoothness vs accumulation)
    if (d > containerRadius - softEdge) {
        float overshoot = d - (containerRadius - softEdge);
        float blend = smoothstep(0.0, softEdge, overshoot);
        
        // Target: clamped position at boundary
        vec2 r_as_clamped = (r_as / max(d, 1e-6)) * containerRadius;
        vec2 r_uv_clamped = vec2(r_as_clamped.x / max(aspect, 1e-6), r_as_clamped.y);
        vec2 target = center + r_uv_clamped;
        
        // Smooth blend toward boundary
        return mix(coord, target, blend);
    }
    return coord;
}

void main() {
    vec2 velocity = texture(u_velocity_texture, v_texCoord).xy;
    // Integrate backtrace with dt (velocity stored in UV units)
    vec2 dt_vel = velocity * u_dt;
    
    // MacCormack advection for high-fidelity transport
    // Reference: GPU Gems 3, Chapter 30
    
    // Step 1: Forward advection (semi-Lagrangian)
    vec2 coord_forward = clampToCircle(v_texCoord - dt_vel);
    vec4 forward = texture(u_color_texture, coord_forward);

    // For velocity fields, prefer stable semi-Lagrangian to avoid oscillations
    if (u_isVelocity == 1) {
        outColor = vec4(forward.xy, 0.0, 1.0);
        return;
    }
    
    // Step 2: Backward advection (reverse step to estimate error)
    vec2 vel_forward = texture(u_velocity_texture, coord_forward).xy;
    vec2 coord_backward = clampToCircle(coord_forward + vel_forward * u_dt);
    vec4 backward = texture(u_color_texture, coord_backward);
    
    // Step 3: Error correction
    vec4 current = texture(u_color_texture, v_texCoord);
    vec4 corrected = forward + 0.5 * (current - backward);
    
    // Step 4: Min/max limiter (prevents overshoots, maintains stability)
    // Sample neighborhood of forward position using true texture texel size
    vec2 texel = 1.0 / vec2(textureSize(u_color_texture, 0));
    vec4 n0 = texture(u_color_texture, clampToCircle(coord_forward + vec2(-texel.x, -texel.y)));
    vec4 n1 = texture(u_color_texture, clampToCircle(coord_forward + vec2(0.0, -texel.y)));
    vec4 n2 = texture(u_color_texture, clampToCircle(coord_forward + vec2(texel.x, -texel.y)));
    vec4 n3 = texture(u_color_texture, clampToCircle(coord_forward + vec2(-texel.x, 0.0)));
    vec4 n4 = forward;
    vec4 n5 = texture(u_color_texture, clampToCircle(coord_forward + vec2(texel.x, 0.0)));
    vec4 n6 = texture(u_color_texture, clampToCircle(coord_forward + vec2(-texel.x, texel.y)));
    vec4 n7 = texture(u_color_texture, clampToCircle(coord_forward + vec2(0.0, texel.y)));
    vec4 n8 = texture(u_color_texture, clampToCircle(coord_forward + vec2(texel.x, texel.y)));
    
    vec4 minVal = min(min(min(n0, n1), min(n2, n3)), min(min(n4, n5), min(n6, min(n7, n8))));
    vec4 maxVal = max(max(max(n0, n1), max(n2, n3)), max(max(n4, n5), max(n6, max(n7, n8))));
    
    // Soften limiter: allow significant overshoots to reduce banding
    float epsilon = 0.08; // larger margin to avoid hard clamping steps
    outColor = clamp(corrected, minVal - epsilon, maxVal + epsilon);
    
    if (u_isVelocity == 0) {
        // Color-only: blend with forward to reduce banding from limiter
        float sharpness = 0.3; // lower = more forward, less MacCormack artifacts
        outColor = mix(forward, outColor, sharpness);
        outColor.rgb = clamp(outColor.rgb, vec3(0.0), vec3(1.0));

        // Conservative magnitude cap: do not exceed neighborhood max or slightly above previous
        float prevMag = length(current.rgb);
        float newMag = length(outColor.rgb);
        float neiMax = max(max(max(length(n0.rgb), length(n1.rgb)), max(length(n2.rgb), length(n3.rgb))),
                          max(max(length(n4.rgb), length(n5.rgb)), max(length(n6.rgb), max(length(n7.rgb), length(n8.rgb)))));
        float cap = min(neiMax, prevMag + 0.05); // allow more growth to reduce banding
        if (newMag > cap && newMag > 1e-6) {
            outColor.rgb *= cap / newMag;
            newMag = cap;
        }

        float conc = length(outColor.rgb);
        if (conc > 1.0) {
            outColor.rgb *= (1.0 / conc);
        }
        
        // Gentle rim absorption to prevent accumulation artifact
        float aspect = u_resolution.x / max(u_resolution.y, 1.0);
        vec2 r = v_texCoord - center;
        vec2 r_as = vec2(r.x * aspect, r.y);
        float d = length(r_as);
        float rimAbsorption = smoothstep(containerRadius - 0.03, containerRadius, d);
        outColor.rgb *= (1.0 - rimAbsorption * 0.08); // 8% absorption in rim band
        
        outColor.a = 1.0;
    } else {
        // Velocity: keep signed components, do not clamp to [0,1]
        outColor.ba = vec2(0.0, 1.0);
    }
}
