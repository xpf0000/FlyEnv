import * as THREE from 'three'

const EDGE_VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute float aSourceCategory;
  attribute float aTargetCategory;
  attribute float aSourceIndex;
  attribute float aTargetIndex;
  uniform float uFocusCategory;
  uniform float uSelectedIndex;
  uniform float uGlobalGold;
  uniform float uUnrelatedAlpha;
  uniform float uCrossAlpha;
  uniform float uEdgeKind;
  uniform float uCenterDepth;
  uniform float uRadius;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float focused = step(-0.5, uFocusCategory);
    float sourceMatch = 1.0 - step(0.1, abs(aSourceCategory - uFocusCategory));
    float targetMatch = 1.0 - step(0.1, abs(aTargetCategory - uFocusCategory));
    float direct = max(sourceMatch, targetMatch);
    float internal = sourceMatch * targetMatch;
    float selected = max(
      1.0 - step(0.1, abs(aSourceIndex - uSelectedIndex)),
      1.0 - step(0.1, abs(aTargetIndex - uSelectedIndex))
    ) * step(-0.5, uSelectedIndex);
    float focusAlpha = direct * 0.8;
    if (uEdgeKind > 0.5 && uEdgeKind < 1.5) {
      focusAlpha = max(internal, direct * (1.0 - internal) * uCrossAlpha);
    } else if (uEdgeKind > 1.5) {
      focusAlpha = internal * 0.3;
    }
    focusAlpha = max(focusAlpha, (1.0 - direct) * uUnrelatedAlpha);
    focusAlpha = max(focusAlpha, selected);

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float depth = max(1.0, -viewPosition.z);
    float normalizedDepth = clamp((depth - (uCenterDepth - uRadius)) / (2.0 * uRadius), 0.0, 1.0);
    float depthAlpha = mix(1.0, 0.28, pow(normalizedDepth, 1.25));
    vColor = mix(aColor, vec3(1.0, 0.56, 0.12), uGlobalGold * (1.0 - selected));
    vAlpha = mix(1.0, focusAlpha, focused) * depthAlpha;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const EDGE_FRAGMENT_SHADER = `
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(vColor, uAlpha * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function createEdgeMaterial(kind: 'membership' | 'semantic' | 'visual', opacity: number) {
  const edgeKind = kind === 'membership' ? 0 : kind === 'semantic' ? 1 : 2
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlpha: { value: opacity },
      uFocusCategory: { value: -1 },
      uSelectedIndex: { value: -1 },
      uGlobalGold: { value: 0.62 },
      uUnrelatedAlpha: { value: 0.07 },
      uCrossAlpha: { value: 0.32 },
      uEdgeKind: { value: edgeKind },
      uCenterDepth: { value: 40 },
      uRadius: { value: 14 }
    },
    vertexShader: EDGE_VERTEX_SHADER,
    fragmentShader: EDGE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
}
