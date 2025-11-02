#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oilVelocity;
uniform sampler2D u_oilThickness;
uniform sampler2D u_oilProps;     // Per-pixel properties (R=coupling, G=viscosity, B=surfaceTension, A=drag)
uniform float u_surfaceTension;   // Global fallback
uniform float u_useProps;         // 1.0 = use per-pixel props, 0.0 = use global
uniform float u_dt;
uniform vec2 u_resolution;

void main() {
    vec2 velocity = texture(u_oilVelocity, v_texCoord).xy;
    float thickness = texture(u_oilThickness, v_texCoord).a;
    
    // Get surface tension from per-pixel props or global uniform
    float tension = u_surfaceTension;
    if (u_useProps > 0.5) {
        vec4 props = texture(u_oilProps, v_texCoord);
        tension = props.b; // B channel = surface tension
    }
    
    // Only apply force where oil exists
    if (thickness < 0.001 || tension <= 0.0) {
        fragColor = vec4(velocity, 0.0, 1.0);
        return;
    }
    
    // Compute curvature (Laplacian of thickness) using central differences
    vec2 texel = 1.0 / u_resolution;
    
    float thL = texture(u_oilThickness, v_texCoord + vec2(-texel.x, 0.0)).a;
    float thR = texture(u_oilThickness, v_texCoord + vec2(texel.x, 0.0)).a;
    float thD = texture(u_oilThickness, v_texCoord + vec2(0.0, -texel.y)).a;
    float thU = texture(u_oilThickness, v_texCoord + vec2(0.0, texel.y)).a;
    float thC = thickness;
    
    // Laplacian: ∇²thickness = (thL + thR + thD + thU - 4*thC) / h²
    // In texture space h = 1 texel, so we just use texel-normalized units
    float laplacian = (thL + thR + thD + thU - 4.0 * thC);
    
    // Compute thickness gradient for directional force
    vec2 gradThickness = vec2(thR - thL, thU - thD) * 0.5;
    float gradMag = length(gradThickness);
    
    // Surface tension creates force opposing curvature (toward flatter regions)
    // Force direction: along negative gradient of curvature
    // Simplified: move toward lower curvature (higher Laplacian means more force)
    vec2 force = vec2(0.0);
    
    if (gradMag > 1e-6) {
        // Direction: perpendicular to thickness gradient (tangent to interface)
        // Actually, surface tension pulls along the thickness gradient toward thicker regions
        vec2 forceDir = normalize(gradThickness);
        
        // Magnitude: proportional to curvature and thickness
        // Use absolute laplacian so concave and convex both create cohesive forces
        float forceMag = abs(laplacian) * tension * smoothstep(0.0, 0.3, thickness);
        
        force = forceDir * forceMag * u_dt;
        
        // Clamp force to prevent instability
        float maxForce = 0.05; // Maximum velocity change per frame
        if (length(force) > maxForce) {
            force = normalize(force) * maxForce;
        }
    }
    
    // Apply force to velocity
    velocity += force;
    
    fragColor = vec4(velocity, 0.0, 1.0);
}
