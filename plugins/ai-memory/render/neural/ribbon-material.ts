import * as THREE from 'three'

const RIBBON_VERTEX_SHADER = `
  attribute vec3 aPrevious;
  attribute vec3 aNext;
  attribute vec3 aColor;
  attribute float aSide;
  attribute float aAlpha;
  attribute float aSegmentProgress;
  attribute float aPathProgress;
  uniform vec2 uResolution;
  uniform float uWidth;
  uniform float uCenterDepth;
  uniform float uRadius;
  varying vec3 vColor;
  varying float vSide;
  varying float vAlpha;
  varying float vSegmentProgress;
  varying float vPathProgress;

  void main() {
    vec4 current = modelViewMatrix * vec4(position, 1.0);
    vec4 previous = modelViewMatrix * vec4(aPrevious, 1.0);
    vec4 next = modelViewMatrix * vec4(aNext, 1.0);
    vec4 clip = projectionMatrix * current;
    vec4 previousClip = projectionMatrix * previous;
    vec4 nextClip = projectionMatrix * next;
    vec2 currentScreen = (clip.xy / clip.w) * uResolution;
    vec2 previousScreen = (previousClip.xy / previousClip.w) * uResolution;
    vec2 nextScreen = (nextClip.xy / nextClip.w) * uResolution;
    vec2 direction = nextScreen - currentScreen;
    if (length(direction) < 0.001) {
      direction = currentScreen - previousScreen;
    }
    if (length(direction) < 0.001) {
      direction = vec2(1.0, 0.0);
    }
    direction = normalize(direction);
    vec2 normal = vec2(-direction.y, direction.x);
    clip.xy += normal * aSide * uWidth * clip.w / uResolution;

    float depth = max(1.0, -current.z);
    float normalizedDepth = clamp((depth - (uCenterDepth - uRadius)) / (2.0 * uRadius), 0.0, 1.0);
    vColor = aColor;
    vSide = aSide;
    vAlpha = aAlpha * mix(1.0, 0.3, pow(normalizedDepth, 1.2));
    vSegmentProgress = aSegmentProgress;
    vPathProgress = aPathProgress;
    gl_Position = clip;
  }
`

const RIBBON_FRAGMENT_SHADER = `
  uniform float uAlpha;
  uniform float uBrightness;
  uniform float uStatic;
  uniform float uTime;
  uniform float uMotion;
  uniform vec3 uBaseColor;
  uniform vec3 uHighlightColor;
  varying vec3 vColor;
  varying float vSide;
  varying float vAlpha;
  varying float vSegmentProgress;
  varying float vPathProgress;

  void main() {
    float distanceFromCenter = abs(vSide);
    float softEdge = pow(max(0.0, 1.0 - distanceFromCenter), 1.8);
    float core = 1.0 - smoothstep(0.035, 0.18, distanceFromCenter);
    float segmentFade = smoothstep(0.0, 0.08, vSegmentProgress)
      * (1.0 - smoothstep(0.92, 1.0, vSegmentProgress));
    segmentFade = mix(1.0, segmentFade, uStatic);

    float pathWave = sin(vPathProgress * 6.2831853 * 6.0);
    float peak = pow(max(0.0, pathWave), 14.0) * uStatic;
    float energyPulse = 0.88 + 0.12 * sin(uTime * 0.55 + vPathProgress * 6.2831853) * uMotion;
    float microTexture = 0.76 + 0.24 * smoothstep(
      -0.55,
      0.35,
      sin(vPathProgress * 6.2831853 * 83.0)
    );
    microTexture = mix(1.0, microTexture, uStatic);
    float highlight = peak * energyPulse;
    float alpha = (softEdge * 0.44 + core * 0.48) * vAlpha * uAlpha * segmentFade * microTexture;
    if (alpha < 0.002) discard;

    vec3 base = mix(vColor, uBaseColor * (0.82 + peak * 0.12), uStatic);
    vec3 color = mix(base, uHighlightColor, highlight * 0.68);
    gl_FragColor = vec4(color * (uBrightness + core * 0.12 + highlight * 0.3), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function createRibbonMaterial(
  width: number,
  opacity: number,
  brightness = 1.2,
  purpose: 'static' | 'flow' = 'static'
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uWidth: { value: width },
      uAlpha: { value: opacity },
      uBrightness: { value: brightness },
      uStatic: { value: purpose === 'static' ? 1 : 0 },
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uBaseColor: { value: new THREE.Color('#e8a933') },
      uHighlightColor: { value: new THREE.Color('#ffe0a3') },
      uCenterDepth: { value: 40 },
      uRadius: { value: 14 }
    },
    vertexShader: RIBBON_VERTEX_SHADER,
    fragmentShader: RIBBON_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  })
}
