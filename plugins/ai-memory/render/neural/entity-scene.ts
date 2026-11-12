import * as THREE from 'three'

import { buildEntityModel } from './entity-model'
import type { EntityArc, EntityCircuit, EntityFlow } from './entity-model'
import type { NeuralModel } from './model'
import { createRibbonMaterial } from './ribbon-material'
import { createPathMetrics, createRibbonGeometry, samplePathByDistance } from './ribbon'
import type { PathMetrics } from './ribbon'
import { OuterArcLayer } from './outer-arc-layer'
import { CircuitField } from './circuit-field'

const CORE_VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uMotion;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vStrength;

  void main() {
    vec3 displaced = position + vec3(
      sin(uTime * 0.51 + aPhase),
      cos(uTime * 0.43 + aPhase * 1.2),
      sin(uTime * 0.37 + aPhase * 0.7)
    ) * 0.035 * uMotion;
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    float depth = max(1.0, -viewPosition.z);
    float depthLight = mix(1.0, 0.3, smoothstep(18.0, 52.0, depth));
    vColor = aColor;
    vStrength = (0.82 + sin(uTime * 0.9 + aPhase) * 0.18 * uMotion) * depthLight;
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * uPixelRatio * (205.0 / depth), 1.0, 20.0);
  }
`

const CORE_FRAGMENT_SHADER = `
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vStrength;

  void main() {
    float radius = length(gl_PointCoord * 2.0 - 1.0);
    if (radius > 1.0) discard;
    float core = exp(-radius * radius * 10.0);
    float halo = pow(max(0.0, 1.0 - radius), 2.2);
    float alpha = (core + halo * 0.5) * uAlpha * vStrength;
    vec3 energy = mix(vColor, vec3(1.0), core * 0.38);
    gl_FragColor = vec4(energy * 1.2, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const STRUCTURE_VERTEX_SHADER = `
  attribute vec3 aColor;
  uniform float uCenterDepth;
  uniform float uRadius;
  varying vec3 vColor;
  varying float vDepthAlpha;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float depth = max(1.0, -viewPosition.z);
    float normalizedDepth = clamp((depth - (uCenterDepth - uRadius)) / (2.0 * uRadius), 0.0, 1.0);
    vColor = aColor;
    vDepthAlpha = mix(1.0, 0.2, pow(normalizedDepth, 1.35));
    gl_Position = projectionMatrix * viewPosition;
  }
`

const STRUCTURE_FRAGMENT_SHADER = `
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vDepthAlpha;

  void main() {
    gl_FragColor = vec4(vColor, uAlpha * vDepthAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const FLOW_TAIL_STEPS = 14

type LayerMaterial = {
  material: THREE.ShaderMaterial
  opacity: number
}

type FlowRuntime = {
  flow: EntityFlow
  metrics: PathMetrics
}

type FlowLayer = {
  flows: FlowRuntime[]
  points: THREE.Mesh
  position: THREE.BufferAttribute
  previous: THREE.BufferAttribute
  next: THREE.BufferAttribute
  alpha: THREE.BufferAttribute
}

export class NeuralEntity {
  readonly root = new THREE.Group()
  readonly bounds: ReturnType<typeof buildEntityModel>['bounds']

  private readonly coreMaterial: THREE.ShaderMaterial
  private readonly fiberMaterial: THREE.ShaderMaterial
  private readonly layerMaterials: LayerMaterial[] = []
  private readonly ribbonMaterials: THREE.ShaderMaterial[] = []
  private readonly flowLayers: FlowLayer[] = []
  private readonly motionGroups = new Map<number, THREE.Group>()
  private readonly spriteMaterials: THREE.SpriteMaterial[] = []
  private readonly textures = new Set<THREE.Texture>()
  private focusTarget = 0
  private focusAmount = 0
  private disposed = false
  private outerArcs?: OuterArcLayer
  private readonly circuitField: CircuitField

  constructor(model: NeuralModel) {
    const entity = buildEntityModel(model)
    this.bounds = entity.bounds
    this.root.name = 'decorative-cognitive-entity'
    this.circuitField = new CircuitField(model)
    this.root.add(this.circuitField.root)
    try {
      this.outerArcs = new OuterArcLayer(entity.outerTracks)
      this.root.add(this.outerArcs.root)
    } catch (error) {
      console.error('Transient exterior arcs are unavailable', error)
    }

    const positions = new Float32Array(entity.particles.length * 3)
    const colors = new Float32Array(entity.particles.length * 3)
    const sizes = new Float32Array(entity.particles.length)
    const phases = new Float32Array(entity.particles.length)
    entity.particles.forEach((particle, index) => {
      positions.set(particle.position, index * 3)
      const color = new THREE.Color(particle.color)
      colors.set([color.r, color.g, color.b], index * 3)
      sizes[index] = particle.size
      phases[index] = particle.phase
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    this.coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uPixelRatio: { value: Math.min(globalThis.devicePixelRatio ?? 1, 2) },
        uAlpha: { value: 0.58 }
      },
      vertexShader: CORE_VERTEX_SHADER,
      fragmentShader: CORE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const particles = new THREE.Points(geometry, this.coreMaterial)
    particles.frustumCulled = false
    this.root.add(particles)

    this.fiberMaterial = this.createStructureMaterial(0.24)
    this.root.add(
      new THREE.LineSegments(this.createFiberGeometry(entity.fibers), this.fiberMaterial)
    )

    for (const groupId of [0, 1, 2, 20]) {
      const group = new THREE.Group()
      group.name = `entity-motion-${groupId}`
      this.motionGroups.set(groupId, group)
      this.root.add(group)
      const arcs = entity.arcs.filter((arc) => arc.group === groupId)
      const circuits = entity.circuits.filter((circuit) => circuit.group === groupId)
      const companionArcs = arcs.filter((arc) => arc.role === 'companion')
      const primaryArcs = arcs.filter((arc) => arc.role === 'primary')
      if (companionArcs.length + circuits.length > 0) {
        const opacity = groupId < 10 ? 0.44 : groupId === 10 ? 0.34 : 0.25
        const material = this.createStructureMaterial(opacity)
        this.layerMaterials.push({ material, opacity })
        group.add(
          new THREE.LineSegments(this.createLayerGeometry(companionArcs, circuits), material)
        )
      }
      if (primaryArcs.length > 0) {
        const opacity = groupId < 10 ? 0.44 : 0.38
        const material = createRibbonMaterial(groupId < 10 ? 5 : 4.5, opacity, 1.05)
        this.ribbonMaterials.push(material)
        this.layerMaterials.push({ material, opacity })
        const ribbon = new THREE.Mesh(createRibbonGeometry(primaryArcs), material)
        ribbon.name = `entity-primary-${groupId}`
        ribbon.frustumCulled = false
        group.add(ribbon)
      }

      const flows = entity.flows.filter((flow) => flow.group === groupId)
      if (flows.length > 0) {
        const flowLayer = this.createEnergyLayer(flows)
        flowLayer.points.name = `entity-energy-${groupId}`
        this.flowLayers.push(flowLayer)
        group.add(flowLayer.points)
      }
    }

    const coreTexture = this.createCoreTexture()
    this.textures.add(coreTexture)
    const haloMaterial = new THREE.SpriteMaterial({
      map: coreTexture,
      color: '#f59e0b',
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    })
    const halo = new THREE.Sprite(haloMaterial)
    halo.scale.setScalar(15.5)
    this.spriteMaterials.push(haloMaterial)
    this.root.add(halo)

    const coreSpriteMaterial = new THREE.SpriteMaterial({
      map: coreTexture,
      color: '#fff7ed',
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    })
    const core = new THREE.Sprite(coreSpriteMaterial)
    core.scale.setScalar(5.8)
    this.spriteMaterials.push(coreSpriteMaterial)
    this.root.add(core)
  }

  resize(pixelRatio: number, width: number, height: number) {
    this.coreMaterial.uniforms.uPixelRatio.value = pixelRatio
    this.outerArcs?.resize(width, height)
    this.circuitField.resize(pixelRatio, width, height)
    this.ribbonMaterials.forEach((material) => {
      material.uniforms.uResolution.value.set(width, height)
    })
  }

  setFocused(focused: boolean) {
    this.focusTarget = focused ? 1 : 0
  }

  disableCircuitField() {
    this.circuitField.root.visible = false
  }

  disableOuterArcs() {
    // Keep GPU resources alive until the owning entity is disposed, outside compilation.
    this.outerArcs?.disable()
  }

  render(time: number, delta: number, reducedMotion: boolean, camera: THREE.Camera) {
    if (this.disposed) {
      return
    }
    const interpolation = reducedMotion ? 1 : 1 - Math.exp(-delta * 0.008)
    this.focusAmount = THREE.MathUtils.lerp(this.focusAmount, this.focusTarget, interpolation)
    const visibility = 1 - this.focusAmount * 0.94
    const viewCenter = new THREE.Vector3()
      .setFromMatrixPosition(this.root.matrixWorld)
      .applyMatrix4(camera.matrixWorldInverse)
    const centerDepth = Math.max(1, -viewCenter.z)
    this.outerArcs?.render(time, visibility, centerDepth)
    this.circuitField.render(time, visibility, centerDepth)
    this.coreMaterial.uniforms.uTime.value = time
    this.coreMaterial.uniforms.uMotion.value = reducedMotion ? 0 : 1
    this.coreMaterial.uniforms.uAlpha.value = 0.58 * visibility
    this.layerMaterials.forEach(({ material, opacity }) => {
      material.uniforms.uAlpha.value = opacity * visibility
      if (material.uniforms.uTime) {
        material.uniforms.uTime.value = time
        material.uniforms.uMotion.value = reducedMotion ? 0 : 1
      }
      if (material.uniforms.uCenterDepth) {
        material.uniforms.uCenterDepth.value = centerDepth
        material.uniforms.uRadius.value = this.bounds.radius
      }
    })
    this.flowLayers.forEach((layer) => {
      layer.points.visible = !reducedMotion
      if (!reducedMotion) {
        this.updateEnergyLayer(layer, time)
      }
    })
    this.fiberMaterial.uniforms.uAlpha.value = 0.15 * visibility
    const coreNearFade = THREE.MathUtils.smoothstep(
      centerDepth,
      this.bounds.radius * 0.3,
      this.bounds.radius * 0.7
    )
    this.spriteMaterials.forEach((material, index) => {
      material.opacity = (index === 0 ? 0.025 : 0.26) * visibility * coreNearFade
    })

    const scale = 1 + Math.sin(time * 0.82) * 0.018
    this.root.scale.setScalar(scale)
    this.motionGroups
      .get(0)
      ?.rotation.set(0.35 + Math.sin(time * 0.17) * 0.12, time * 0.24, 0.1 + time * 0.04)
    this.motionGroups
      .get(1)
      ?.rotation.set(1.15 - time * 0.18, 0.6 + Math.sin(time * 0.13) * 0.2, 0.8 + time * 0.1)
    this.motionGroups
      .get(2)
      ?.rotation.set(0.7 + Math.sin(time * 0.11) * 0.16, -0.85 + time * 0.14, 1.3 - time * 0.2)
  }

  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    this.root.traverse((object) => {
      if (
        object instanceof THREE.Points ||
        object instanceof THREE.LineSegments ||
        object instanceof THREE.Mesh
      ) {
        geometries.add(object.geometry)
        materials.add(object.material)
      } else if (object instanceof THREE.Sprite) {
        materials.add(object.material)
      }
    })
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    this.textures.forEach((texture) => texture.dispose())
    this.root.clear()
  }

  private createStructureMaterial(opacity: number) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: opacity },
        uCenterDepth: { value: 40 },
        uRadius: { value: this.bounds.radius }
      },
      vertexShader: STRUCTURE_VERTEX_SHADER,
      fragmentShader: STRUCTURE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  }

  private createFiberGeometry(fibers: ReturnType<typeof buildEntityModel>['fibers']) {
    const positions: number[] = []
    const colors: number[] = []
    fibers.forEach((fiber) => {
      for (let index = 0; index < fiber.points.length - 1; index += 1) {
        positions.push(...fiber.points[index], ...fiber.points[index + 1])
        const from = new THREE.Color(fiber.colors[index]).multiplyScalar(0.9)
        const to = new THREE.Color(fiber.colors[index + 1]).multiplyScalar(0.9)
        colors.push(...from.toArray(), ...to.toArray())
      }
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
    return geometry
  }

  private createLayerGeometry(arcs: EntityArc[], circuits: EntityCircuit[]) {
    const positions: number[] = []
    const colors: number[] = []
    arcs.forEach((arc) => {
      const color = new THREE.Color(arc.color).multiplyScalar(0.62 + arc.energy * 0.92)
      for (let index = 0; index < arc.points.length - 1; index += 1) {
        positions.push(...arc.points[index], ...arc.points[index + 1])
        colors.push(...color.toArray(), ...color.toArray())
      }
    })
    circuits.forEach((circuit) => {
      const color = new THREE.Color(circuit.color).multiplyScalar(0.55 + circuit.energy * 0.78)
      for (let index = 0; index < circuit.points.length - 1; index += 1) {
        positions.push(...circuit.points[index], ...circuit.points[index + 1])
        colors.push(...color.toArray(), ...color.toArray())
      }
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
    return geometry
  }

  private createEnergyLayer(sourceFlows: EntityFlow[]): FlowLayer {
    const flows = sourceFlows.flatMap((flow) => {
      const headCount = flow.system === 'core' ? 2 : 1
      return Array.from({ length: headCount }, (_, head) => ({
        flow: { ...flow, phase: (flow.phase + head / headCount) % 1 },
        metrics: createPathMetrics(flow.points)
      }))
    })
    const geometry = createRibbonGeometry(
      flows.map(({ flow }) => ({
        points: Array.from(
          { length: FLOW_TAIL_STEPS },
          (_, index) => [index, 0, 0] as [number, number, number]
        ),
        color: flow.color,
        energy: 0.9
      }))
    )
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const previous = geometry.getAttribute('aPrevious') as THREE.BufferAttribute
    const next = geometry.getAttribute('aNext') as THREE.BufferAttribute
    const alpha = geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    ;[position, previous, next, alpha].forEach((attribute) => {
      attribute.setUsage(THREE.DynamicDrawUsage)
    })
    const system = sourceFlows[0]?.system ?? 'shell'
    const opacity = system === 'core' ? 0.68 : 0.5
    const material = createRibbonMaterial(
      system === 'core' ? 3.2 : system === 'fiber' ? 2.4 : 2.6,
      opacity,
      1.08,
      'flow'
    )
    this.ribbonMaterials.push(material)
    this.layerMaterials.push({ material, opacity })
    const points = new THREE.Mesh(geometry, material)
    points.frustumCulled = false
    points.userData.headCount = flows.length
    return { flows, points, position, previous, next, alpha }
  }

  private updateEnergyLayer(layer: FlowLayer, time: number) {
    const positions = layer.position.array as Float32Array
    const previous = layer.previous.array as Float32Array
    const next = layer.next.array as Float32Array
    const alphas = layer.alpha.array as Float32Array
    const writeVertex = (
      index: number,
      point: [number, number, number],
      before: [number, number, number],
      after: [number, number, number],
      alpha: number
    ) => {
      positions.set(point, index * 3)
      previous.set(before, index * 3)
      next.set(after, index * 3)
      alphas[index] = alpha
    }

    layer.flows.forEach(({ flow, metrics }, flowIndex) => {
      const centers: [number, number, number][] = []
      const centerAlphas: number[] = []
      const travel = (flow.phase + time * flow.speed) % 1
      for (let sampleIndex = 0; sampleIndex < FLOW_TAIL_STEPS; sampleIndex += 1) {
        const tail = sampleIndex / (FLOW_TAIL_STEPS - 1)
        let pathTime = travel - tail * 0.035
        if (flow.closed) {
          pathTime = ((pathTime % 1) + 1) % 1
        } else {
          pathTime = THREE.MathUtils.clamp(pathTime, 0, 1)
        }
        const sample = samplePathByDistance(metrics, pathTime)
        centers.push(sample.point)
        const coverage = THREE.MathUtils.lerp(
          flow.coverage[sample.segment] ?? 1,
          flow.coverage[sample.segment + 1] ?? 1,
          sample.blend
        )
        const envelope = flow.closed
          ? 1
          : THREE.MathUtils.smoothstep(pathTime, 0, 0.08) *
            (1 - THREE.MathUtils.smoothstep(pathTime, 0.92, 1))
        centerAlphas.push(coverage * Math.pow(1 - tail, 1.6) * envelope)
      }

      for (let segment = 0; segment < FLOW_TAIL_STEPS - 1; segment += 1) {
        const from = centers[segment]
        const to = centers[segment + 1]
        const beforeFrom = centers[Math.max(0, segment - 1)]
        const afterTo = centers[Math.min(FLOW_TAIL_STEPS - 1, segment + 2)]
        const base = flowIndex * (FLOW_TAIL_STEPS - 1) * 6 + segment * 6
        writeVertex(base, from, beforeFrom, to, centerAlphas[segment])
        writeVertex(base + 1, from, beforeFrom, to, centerAlphas[segment])
        writeVertex(base + 2, to, from, afterTo, centerAlphas[segment + 1])
        writeVertex(base + 3, to, from, afterTo, centerAlphas[segment + 1])
        writeVertex(base + 4, from, beforeFrom, to, centerAlphas[segment])
        writeVertex(base + 5, to, from, afterTo, centerAlphas[segment + 1])
      }
    })
    layer.position.needsUpdate = true
    layer.previous.needsUpdate = true
    layer.next.needsUpdate = true
    layer.alpha.needsUpdate = true
  }

  private createCoreTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.07, 'rgba(255,247,224,0.98)')
      gradient.addColorStop(0.2, 'rgba(251,191,36,0.52)')
      gradient.addColorStop(0.5, 'rgba(245,158,11,0.12)')
      gradient.addColorStop(1, 'rgba(245,158,11,0)')
      context.fillStyle = gradient
      context.fillRect(0, 0, 128, 128)
      context.strokeStyle = 'rgba(254,243,199,0.68)'
      context.lineWidth = 1
      context.beginPath()
      context.arc(64, 64, 21, 0.25, Math.PI * 1.72)
      context.stroke()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }
}
