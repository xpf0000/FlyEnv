import * as THREE from 'three'
import type { NeuralModel } from './model'
import { createRibbonGeometry } from './ribbon'
import { createRibbonMaterial } from './ribbon-material'

type Point = [number, number, number]
export type FieldPath = {
  points: Point[]
  color: string
  energy: number
  category: number
  phase: number
}

export function buildCircuitField(model: NeuralModel) {
  let seed = 0x7176a12
  const random = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5) | 0
    return (seed >>> 0) / 4294967296
  }
  const paths: FieldPath[] = []
  const palette = ['#f7b338', '#e79720', '#ffd270', '#c77316']
  for (let patch = 0; patch < 28; patch++) {
    const longitude = patch * 2.399963
    const latitude = Math.asin(1 - (2 * (patch + 0.5)) / 28)
    const radius = patch % 4 === 0 ? 4.5 + random() * 1.8 : 8 + random() * 1.8
    const turn = random() * Math.PI * 2
    const pointAt = (x: number, y: number, lane = 0): Point => {
      const dx = x * Math.cos(turn) - y * Math.sin(turn)
      const dy = x * Math.sin(turn) + y * Math.cos(turn)
      const lat = latitude + dy
      const rad = radius + lane * 0.028
      return [
        Math.cos(lat) * Math.cos(longitude + dx) * rad,
        Math.sin(lat) * rad,
        Math.cos(lat) * Math.sin(longitude + dx) * rad
      ]
    }
    const phase = random() * 12
    // Shared curved bus rails and attached return branches make a coherent circuit plate.
    for (let rail = 0; rail < 2; rail++) {
      const points: Point[] = []
      for (let j = 0; j <= 20; j++) points.push(pointAt(-0.33 + (j / 20) * 0.66, rail * 0.012))
      paths.push({ points, color: '#f5b840', energy: 1.6 + random() * 0.3, category: -1, phase })
    }
    for (let circuit = 0; circuit < 30; circuit++) {
      const anchor = -0.25 + ((circuit % 10) / 9) * 0.5
      const row = Math.floor(circuit / 10)
      const direction = circuit % 2 === 0 ? 1 : -1
      const height = direction * (0.045 + row * 0.055 + random() * 0.025)
      const length = (0.055 + random() * 0.13) * (row % 2 === 0 ? 1 : -1)
      const steps = [
        [anchor, 0],
        [anchor, height * 0.4],
        [anchor + length * 0.35, height * 0.4],
        [anchor + length * 0.35, height],
        [anchor + length, height],
        [anchor + length, height * 0.7],
        [anchor + length * 1.14, height * 0.7],
        [anchor + length * 1.14, height * 1.12]
      ]
      const points = steps.map(([x, y]) => pointAt(x, y))
      paths.push({
        points,
        color: palette[Math.floor(random() * palette.length)],
        energy: 0.7 + random() * 0.7,
        category: -1,
        phase: phase + circuit * 0.12
      })
      if (circuit % 3 === 0) {
        for (let lane = 1; lane <= 2; lane++) {
          paths.push({
            points: steps.map(([x, y], i) => pointAt(x, y + (i === 0 ? 0 : lane * 0.007), lane)),
            color: '#d89221',
            energy: 0.35 + random() * 0.3,
            category: -1,
            phase: phase + circuit * 0.12
          })
        }
      }
    }
  }
  // A compact processor stack, with open coils and clear gaps rather than a glowing disk.
  for (let layer = 0; layer < 7; layer++) {
    const radius = 0.62 + layer * 0.11
    for (let part = 0; part < 3; part++) {
      const start = (part * Math.PI * 2) / 3 + layer * 0.14
      const length = 1.25 + random() * 0.58
      const points: Point[] = []
      for (let j = 0; j <= 24; j++) {
        const angle = start + (length * j) / 24
        const x = Math.cos(angle) * radius,
          y = Math.sin(angle) * radius,
          z = (layer - 3) * 0.095
        points.push([
          x,
          y * Math.cos(0.25) - z * Math.sin(0.25),
          y * Math.sin(0.25) + z * Math.cos(0.25)
        ])
      }
      paths.push({
        points,
        color: layer % 3 === 0 ? '#ffe6b3' : '#ffc853',
        energy: 1.2 + random() * 0.55,
        category: -1,
        phase: random() * 12
      })
    }
  }
  for (let plane = 0; plane < 2; plane++) {
    for (let coil = 0; coil < 3; coil++) {
      for (let part = 0; part < 2; part++) {
        const points: Point[] = []
        for (let j = 0; j <= 24; j++) {
          const a = part * Math.PI + coil * 0.19 + (j / 24) * 2.45
          const r = 0.9 + coil * 0.12
          points.push(
            plane === 0
              ? [Math.cos(a) * r, coil * 0.045, Math.sin(a) * r]
              : [coil * 0.045, Math.cos(a) * r, Math.sin(a) * r]
          )
        }
        paths.push({
          points,
          color: '#ffd57b',
          energy: 1.15,
          category: -1,
          phase: coil + plane * 4
        })
      }
    }
  }
  for (const hub of model.nodes.filter((node) => node.kind === 'category')) {
    const center = new THREE.Vector3(...hub.position)
    const normal = center.clone().normalize()
    const tangent = new THREE.Vector3()
      .crossVectors(
        normal,
        Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
      )
      .normalize()
    const side = new THREE.Vector3().crossVectors(normal, tangent).normalize()
    for (let lane = 0; lane < 12; lane++) {
      const angle = (lane / 12) * Math.PI * 2
      const c = Math.cos(angle),
        s = Math.sin(angle)
      const points: Point[] = []
      for (let j = 0; j < 6; j++) {
        const d = 0.42 + j * 0.22
        const bend = j > 2 ? 0.14 + (lane % 3) * 0.07 : 0
        points.push(
          center
            .clone()
            .addScaledVector(tangent, c * d - s * bend)
            .addScaledVector(side, s * d + c * bend)
            .addScaledVector(normal, Math.sin(j * 0.8 + lane) * 0.035)
            .toArray() as Point
        )
      }
      paths.push({
        points,
        color: lane % 4 === 0 ? '#ffe0a0' : '#edab35',
        energy: 0.8 + random() * 0.4,
        category: hub.category,
        phase: random() * 12
      })
    }
  }
  return { paths, radius: 11.2 }
}

export class CircuitField {
  private readonly glintMaterial: THREE.ShaderMaterial
  private readonly conductorMaterial: THREE.ShaderMaterial
  readonly root: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  constructor(model: NeuralModel) {
    const field = buildCircuitField(model)
    const tracePaths = field.paths.filter((path) => path.energy <= 1.45)
    const conductorPaths = field.paths.filter((path) => path.energy > 1.45)
    const geometry = createRibbonGeometry(tracePaths)
    const phases: number[] = []
    tracePaths.forEach((path) => {
      for (let i = 0; i < (path.points.length - 1) * 6; i++) phases.push(path.phase)
    })
    geometry.setAttribute('aFieldPhase', new THREE.Float32BufferAttribute(phases, 1))
    const material = createRibbonMaterial(1.15, 0.76, 1.75, 'flow')
    material.defines.FLYENV_CIRCUIT_FIELD_LAYER = 1
    material.vertexShader = material.vertexShader
      .replace(
        'varying vec3 vColor;',
        'attribute float aFieldPhase;\nvarying float vFieldPhase;\nvarying vec3 vColor;'
      )
      .replace('vColor = aColor;', 'vFieldPhase = aFieldPhase;\n    vColor = aColor;')
    material.fragmentShader = material.fragmentShader
      .replace('varying vec3 vColor;', 'varying float vFieldPhase;\nvarying vec3 vColor;')
      .replace(
        'float alpha = ',
        'float fieldPulse = 0.72 + 0.28 * sin(uTime * 0.7 + vFieldPhase);\n    float alpha = fieldPulse * '
      )
    this.root = new THREE.Mesh(geometry, material)
    this.root.name = 'holographic-circuit-islands'
    this.root.frustumCulled = false
    const conductorGeometry = createRibbonGeometry(conductorPaths)
    const conductorPhases: number[] = []
    conductorPaths.forEach((path) => {
      for (let i = 0; i < (path.points.length - 1) * 6; i++) conductorPhases.push(path.phase)
    })
    conductorGeometry.setAttribute(
      'aFieldPhase',
      new THREE.Float32BufferAttribute(conductorPhases, 1)
    )
    this.conductorMaterial = material.clone()
    this.conductorMaterial.uniforms.uWidth.value = 1.65
    this.conductorMaterial.uniforms.uBrightness.value = 1.1
    const conductors = new THREE.Mesh(conductorGeometry, this.conductorMaterial)
    conductors.name = 'circuit-plate-buses'
    conductors.frustumCulled = false
    this.root.add(conductors)
    const glintPositions: number[] = [],
      glintPhases: number[] = []
    field.paths.forEach((path) => {
      for (let i = 1; i < path.points.length; i += 2) {
        glintPositions.push(...path.points[i])
        glintPhases.push(path.phase + i)
      }
    })
    const glintGeometry = new THREE.BufferGeometry()
    glintGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glintPositions, 3))
    glintGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(glintPhases, 1))
    this.glintMaterial = new THREE.ShaderMaterial({
      defines: { FLYENV_CIRCUIT_FIELD_LAYER: 1 },
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.7 }, uPixelRatio: { value: 1 } },
      vertexShader: `attribute float aPhase; uniform float uTime; uniform float uPixelRatio; varying float vLight;
        void main(){vec4 p=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*p;
        float pulse=0.5+0.5*sin(aPhase*5.7+uTime*0.65);
        vLight=(0.25+0.75*pow(pulse,4.0))*mix(1.0,0.4,smoothstep(25.0,60.0,-p.z));
        gl_PointSize=(1.4+pow(pulse,12.0)*1.4)*uPixelRatio;}`,
      fragmentShader: `uniform float uAlpha; varying float vLight;
        void main(){float r=length(gl_PointCoord*2.0-1.0);if(r>1.0)discard;
        gl_FragColor=vec4(vec3(2.0,1.12,0.25),exp(-r*r*5.0)*vLight*uAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const glints = new THREE.Points(glintGeometry, this.glintMaterial)
    glints.name = 'circuit-junction-glints'
    glints.frustumCulled = false
    this.root.add(glints)
  }
  resize(pixelRatio: number, width: number, height: number) {
    this.root.material.uniforms.uResolution.value.set(width, height)
    this.conductorMaterial.uniforms.uResolution.value.set(width, height)
    this.glintMaterial.uniforms.uPixelRatio.value = pixelRatio
  }
  render(time: number, visibility: number, depth: number) {
    const u = this.root.material.uniforms
    u.uTime.value = time
    u.uAlpha.value = 0.76 * visibility
    this.glintMaterial.uniforms.uTime.value = time
    this.glintMaterial.uniforms.uAlpha.value = 0.75 * visibility
    u.uCenterDepth.value = depth
    u.uRadius.value = 11.2
    const bus = this.conductorMaterial.uniforms
    bus.uTime.value = time
    bus.uAlpha.value = 0.64 * visibility
    bus.uCenterDepth.value = depth
    bus.uRadius.value = 11.2
  }
}
