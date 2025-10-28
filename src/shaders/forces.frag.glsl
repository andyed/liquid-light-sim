#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform float u_rotation_amount;

void main() {
    vec2 centered_coord = v_texCoord - 0.5;
    float dist = length(centered_coord);
    
    // Circular container boundary (radius = 0.48 to leave edge space)
    const float containerRadius = 0.48;
    
    // Tangential force: perpendicular to radius vector
    // For counter-clockwise rotation: force = (-y, x) * strength
    // Multiplied by 3.0 for better visibility
    vec2 force = vec2(-centered_coord.y, centered_coord.x) * u_rotation_amount * 3.0;
    
    vec4 velocity = texture(u_velocity_texture, v_texCoord);
    
    // Apply boundary constraint: reflect velocity at walls
    if (dist > containerRadius) {
        // Outside container - push velocity inward
        vec2 normal = normalize(centered_coord);
        vec2 reflection = velocity.xy - 2.0 * dot(velocity.xy, normal) * normal;
        outColor = vec4(reflection * 0.5, 0.0, 0.0); // Dampen at walls
    } else {
        outColor = velocity + vec4(force, 0.0, 0.0);
    }
}
