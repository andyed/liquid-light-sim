#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_waterVelocity;
uniform sampler2D u_oilThickness;
uniform float u_couplingStrength;
uniform vec2 u_resolution;

void main() {
    vec2 velocity = texture(u_waterVelocity, v_texCoord).xy;
    float thickness = texture(u_oilThickness, v_texCoord).a;

    if (thickness < 0.001) {
        fragColor = vec4(velocity, 0.0, 1.0);
        return;
    }

    vec2 texel = 1.0 / u_resolution;

    float thL = texture(u_oilThickness, v_texCoord + vec2(-texel.x, 0.0)).a;
    float thR = texture(u_oilThickness, v_texCoord + vec2(texel.x, 0.0)).a;
    float thD = texture(u_oilThickness, v_texCoord + vec2(0.0, -texel.y)).a;
    float thU = texture(u_oilThickness, v_texCoord + vec2(0.0, texel.y)).a;

    vec2 grad = vec2(thR - thL, thU - thD) * 0.5;

    vec2 force = -grad * u_couplingStrength;

    velocity += force;

    fragColor = vec4(velocity, 0.0, 1.0);
}