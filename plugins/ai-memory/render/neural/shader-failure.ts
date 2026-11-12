export function routeShaderFailure<Shader>(
  gl: { getShaderSource(shader: Shader): string | null },
  vertex: Shader,
  fragment: Shader,
  onOuter: () => void,
  onShared: () => void,
  onCircuit: () => void = onShared
) {
  const vertexSource = gl.getShaderSource(vertex) ?? ''
  const fragmentSource = gl.getShaderSource(fragment) ?? ''
  const fieldMarker = /^\s*#define\s+FLYENV_CIRCUIT_FIELD_LAYER\s+1\s*$/m
  if (fieldMarker.test(vertexSource) || fieldMarker.test(fragmentSource)) {
    onCircuit()
    return
  }
  const marker = /^\s*#define\s+FLYENV_OUTER_ARC_LAYER\s+1\s*$/m
  if (marker.test(vertexSource) || marker.test(fragmentSource)) {
    onOuter()
  } else {
    onShared()
  }
}
