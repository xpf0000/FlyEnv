import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

import {
  calculateCameraBounds,
  calculateFitDistance,
  getCategoryNodeIndices,
  getNodeNeighborhoodIndices
} from './camera'
import { createEdgeMaterial } from './edge-material'
import { NeuralEntity } from './entity-scene'
import type { NeuralModel, NeuralNode } from './model'
import { routeShaderFailure } from './shader-failure'

export type { NeuralModel, NeuralNode } from './model'

export type NeuralScreenPosition = {
  x: number
  y: number
  visible: boolean
}

export type NeuralSceneOptions = {
  autoRotate?: boolean
  reducedMotion?: boolean
  onUnavailable?: () => void
}

type EdgeKind = 'membership' | 'semantic' | 'visual'

type HubRing = {
  category: number
  material: THREE.LineBasicMaterial
  opacity: number
}

type NodeUniforms = {
  uTime: { value: number }
  uMotion: { value: number }
  uPixelRatio: { value: number }
  uFocusCategory: { value: number }
  uSelectedIndex: { value: number }
  uGlobalAlpha: { value: number }
  uGlobalGold: { value: number }
}

const NODE_VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  attribute float aCategory;
  attribute float aIndex;
  attribute float aFocusWeight;
  attribute float aActiveAlpha;

  uniform float uTime;
  uniform float uMotion;
  uniform float uPixelRatio;
  uniform float uFocusCategory;
  uniform float uSelectedIndex;
  uniform float uGlobalGold;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSelected;

  void main() {
    float isHub = step(2.0, aSize);
    float focused = 1.0 - step(0.1, uGlobalGold);
    float drift = mix(0.05, 0.018, isHub) * uMotion;
    vec3 displaced = position + vec3(
      sin(uTime * 0.43 + aPhase),
      cos(uTime * 0.37 + aPhase * 1.31),
      sin(uTime * 0.29 + aPhase * 0.73)
    ) * drift;

    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    float viewDepth = max(1.0, -viewPosition.z);
    float depthLight = mix(1.0, 0.3, smoothstep(18.0, 52.0, viewDepth));
    vSelected = aIndex > -0.5 && uSelectedIndex > -0.5 && abs(aIndex - uSelectedIndex) < 0.1
      ? 1.0
      : 0.0;
    float goldAmount = uGlobalGold * (1.0 - vSelected) * mix(1.0, 0.72, isHub);
    vColor = mix(aColor, vec3(1.0, 0.56, 0.12), goldAmount);
    vAlpha = aFocusWeight * aActiveAlpha * depthLight * mix(0.54, 1.0, focused);

    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(
      aSize * mix(0.82, 1.0, focused) * (1.0 + vSelected * 0.48) * uPixelRatio * (155.0 / viewDepth),
      1.0,
      44.0
    );
  }
`

const NODE_FRAGMENT_SHADER = `
  uniform float uGlobalAlpha;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSelected;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float radius = length(point);
    if (radius > 1.0) discard;

    float core = exp(-radius * radius * 11.0);
    float halo = pow(max(0.0, 1.0 - radius), 2.4);
    float alpha = (core * 0.9 + halo * 0.38) * vAlpha * uGlobalAlpha;
    if (alpha < 0.003) discard;

    vec3 energy = mix(vColor, vec3(1.0), core * 0.3);
    gl_FragColor = vec4(energy * (0.82 + core * 0.34 + vSelected * 0.65), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const PULSE_VERTEX_SHADER = `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aCategory;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uFocusCategory;
  uniform float uGlobalGold;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float travel = fract(aPhase + uTime * aSpeed);
    vec3 pulsePosition = mix(aStart, aEnd, travel);
    vec4 viewPosition = modelViewMatrix * vec4(pulsePosition, 1.0);
    float viewDepth = max(1.0, -viewPosition.z);
    float categoryMatch = uFocusCategory < -0.5 || abs(aCategory - uFocusCategory) < 0.1
      ? 1.0
      : 0.04;

    vColor = mix(aColor, vec3(1.0, 0.56, 0.12), uGlobalGold);
    vAlpha = sin(travel * 3.14159265) * categoryMatch * 0.62;
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * uPixelRatio * (145.0 / viewDepth), 1.2, 9.0);
  }
`

const PULSE_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float radius = length(gl_PointCoord * 2.0 - 1.0);
    if (radius > 1.0) discard;
    float alpha = exp(-radius * radius * 5.0) * vAlpha;
    gl_FragColor = vec4(vColor * 1.2, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export class NeuralScene {
  readonly renderer: THREE.WebGLRenderer
  readonly camera: THREE.PerspectiveCamera
  readonly root: THREE.Group

  private readonly container: HTMLElement
  private readonly model: NeuralModel
  private readonly entity: NeuralEntity
  private readonly scene = new THREE.Scene()
  private readonly distanceFog = new THREE.FogExp2(0x000000, 0.012)
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  private readonly output: OutputPass
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly nodePoints: THREE.Points
  private readonly nodeMaterial: THREE.ShaderMaterial
  private readonly nodeUniforms: NodeUniforms
  private readonly pulseMaterial: THREE.ShaderMaterial
  private readonly pulseUniforms: NodeUniforms
  private readonly pulsePoints: THREE.Points
  private readonly particleMaterial: THREE.ShaderMaterial
  private readonly hubSprites: THREE.Sprite[] = []
  private readonly hubRings: HubRing[] = []
  private readonly hubLabels = new Map<string, HTMLDivElement>()
  private readonly overlay: HTMLDivElement
  private readonly resizeObserver: ResizeObserver
  private readonly semanticEdges = new Map<EdgeKind, THREE.LineSegments>()
  private readonly edgeMaterials = new Map<EdgeKind, THREE.ShaderMaterial>()
  private readonly selectedEdgeGeometry = new THREE.BufferGeometry()
  private readonly selectedEdgePosition: THREE.BufferAttribute
  private readonly selectedEdgeMaterial: THREE.LineBasicMaterial
  private readonly selectedEdges: THREE.LineSegments
  private readonly nodeIndexById = new Map<string, number>()
  private readonly homeCenter = new THREE.Vector3()
  private readonly currentTarget = new THREE.Vector3()
  private readonly desiredTarget = new THREE.Vector3()
  private readonly cameraDirection = new THREE.Vector3(0.16, 0.22, 1).normalize()
  private readonly projection = new THREE.Vector3()
  private readonly textures = new Set<THREE.Texture>()
  private readonly originalContainerPosition: string
  private readonly changedContainerPosition: boolean

  private width = 1
  private height = 1
  private radius = 1
  private homeDistance = 1
  private currentDistance = 1
  private desiredDistance = 1
  private selectedNodeId?: string
  private focusedNodeId?: string
  private focusIndices?: number[]
  private autoRotate: boolean
  private reducedMotion: boolean
  private motionTime = 0
  private lastTime?: number
  private disposed = false

  constructor(container: HTMLElement, model: NeuralModel, options: NeuralSceneOptions = {}) {
    this.container = container
    this.model = model
    this.autoRotate = options.autoRotate ?? true
    this.reducedMotion = options.reducedMotion ?? false

    this.originalContainerPosition = container.style.position
    const view = container.ownerDocument.defaultView
    this.changedContainerPosition = view?.getComputedStyle(container).position === 'static'
    if (this.changedContainerPosition) {
      container.style.position = 'relative'
    }

    try {
      this.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      })
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      this.renderer.toneMappingExposure = 1.12
      this.renderer.setClearColor(0x000000, 0)
      this.renderer.setPixelRatio(Math.min(view?.devicePixelRatio ?? 1, 2))
      this.renderer.domElement.style.position = 'absolute'
      this.renderer.domElement.style.inset = '0'
      this.renderer.domElement.style.width = '100%'
      this.renderer.domElement.style.height = '100%'
      this.renderer.domElement.style.display = 'block'
      this.renderer.domElement.style.touchAction = 'none'
      container.appendChild(this.renderer.domElement)

      this.overlay = document.createElement('div')
      this.overlay.style.position = 'absolute'
      this.overlay.style.inset = '0'
      this.overlay.style.overflow = 'hidden'
      this.overlay.style.pointerEvents = 'none'
      this.overlay.setAttribute('aria-hidden', 'true')
      container.appendChild(this.overlay)

      this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 320)
      this.root = new THREE.Group()
      this.root.rotation.set(-0.1, 0.16, 0)
      this.scene.add(this.root)
      this.scene.background = new THREE.Color('#000000')
      this.scene.fog = this.distanceFog

      model.nodes.forEach((node, index) => this.nodeIndexById.set(node.id, index))
      this.entity = new NeuralEntity(model)
      this.calculateBounds()

      this.nodeUniforms = this.createNodeUniforms(1)
      this.nodeMaterial = this.createNodeMaterial(this.nodeUniforms)
      this.nodePoints = this.createNodePoints(model.nodes, this.nodeMaterial)
      this.root.add(this.nodePoints)

      this.particleMaterial = this.createNodeMaterial(this.createNodeUniforms(0.2))
      this.root.add(this.createDeepParticles())

      this.createEdges()
      this.createCircuitTraces()
      this.createHubs()
      this.root.add(this.entity.root)

      const pulseGeometry = this.createPulseGeometry()
      this.pulseUniforms = this.createNodeUniforms(1)
      this.pulseMaterial = new THREE.ShaderMaterial({
        uniforms: this.pulseUniforms,
        vertexShader: PULSE_VERTEX_SHADER,
        fragmentShader: PULSE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      this.pulsePoints = new THREE.Points(pulseGeometry, this.pulseMaterial)
      this.pulsePoints.frustumCulled = false
      this.pulsePoints.visible = !this.reducedMotion
      this.root.add(this.pulsePoints)

      const selectedEdgeCapacity = this.model.nodes.length * 6
      this.selectedEdgePosition = new THREE.BufferAttribute(
        new Float32Array(selectedEdgeCapacity),
        3
      )
      this.selectedEdgePosition.setUsage(THREE.DynamicDrawUsage)
      this.selectedEdgeGeometry.setAttribute('position', this.selectedEdgePosition)
      this.selectedEdgeGeometry.setDrawRange(0, 0)
      this.selectedEdgeMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
      this.selectedEdges = new THREE.LineSegments(
        this.selectedEdgeGeometry,
        this.selectedEdgeMaterial
      )
      this.selectedEdges.visible = false
      this.selectedEdges.frustumCulled = false
      this.root.add(this.selectedEdges)

      this.renderer.debug.onShaderError = (gl, _program, vertex, fragment) => {
        console.error(
          'Neural shader compilation failed',
          gl.getShaderInfoLog(vertex),
          gl.getShaderInfoLog(fragment)
        )
        routeShaderFailure(
          gl,
          vertex,
          fragment,
          () => this.entity.disableOuterArcs(),
          () => {
            queueMicrotask(() => {
              if (!this.disposed) options.onUnavailable?.()
            })
          },
          () => this.entity.disableCircuitField()
        )
      }

      this.currentTarget.copy(this.homeCenter)
      this.desiredTarget.copy(this.homeCenter)
      this.homeDistance = this.calculateHomeDistance()
      this.currentDistance = this.homeDistance
      this.desiredDistance = this.homeDistance
      this.updateCamera()
      this.composer = new EffectComposer(this.renderer)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.2, 0.82)
      this.composer.addPass(this.bloom)
      this.output = new OutputPass()
      this.composer.addPass(this.output)

      this.raycaster.params.Points.threshold = 0.42
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!this.disposed && entry) {
          this.resize(entry.contentRect.width, entry.contentRect.height)
        }
      })
      this.resizeObserver.observe(container)
      this.resize(container.clientWidth, container.clientHeight)
      this.applyMotionState()
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  render(time: number) {
    if (this.disposed) {
      return
    }
    if (this.container.ownerDocument.hidden) {
      this.lastTime = undefined
      return
    }

    const delta = this.lastTime === undefined ? 0 : Math.min(Math.max(time - this.lastTime, 0), 50)
    this.lastTime = time
    if (!this.reducedMotion) {
      this.motionTime += delta * 0.001
      if (this.autoRotate && !this.focusedNodeId) {
        this.root.rotation.y += delta * 0.000035
      }
    }

    this.nodeUniforms.uTime.value = this.motionTime
    this.pulseUniforms.uTime.value = this.motionTime
    this.root.updateMatrixWorld(true)

    this.updateFocusTarget()

    const interpolation = this.reducedMotion ? 1 : 1 - Math.exp(-delta * 0.007)
    this.currentTarget.lerp(this.desiredTarget, interpolation)
    this.currentDistance = THREE.MathUtils.lerp(
      this.currentDistance,
      this.desiredDistance,
      interpolation
    )
    this.updateCamera()
    const viewCenter = new THREE.Vector3()
      .setFromMatrixPosition(this.root.matrixWorld)
      .applyMatrix4(this.camera.matrixWorldInverse)
    this.edgeMaterials.forEach((material) => {
      material.uniforms.uCenterDepth.value = Math.max(1, -viewCenter.z)
      material.uniforms.uRadius.value = this.radius
    })
    this.entity.render(this.motionTime, delta, this.reducedMotion, this.camera)
    this.updateLabels()
    this.composer.render()
  }

  resize(width: number, height: number) {
    if (this.disposed) {
      return
    }
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    const pixelRatio = Math.min(this.container.ownerDocument.defaultView?.devicePixelRatio ?? 1, 2)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(this.width, this.height, false)
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(this.width, this.height)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    this.nodeUniforms.uPixelRatio.value = pixelRatio
    this.pulseUniforms.uPixelRatio.value = pixelRatio
    this.particleMaterial.uniforms.uPixelRatio.value = pixelRatio
    this.entity.resize(pixelRatio, this.width, this.height)

    this.homeDistance = this.calculateHomeDistance()
    if (this.focusedNodeId) {
      this.fitFocusedBounds()
    } else {
      this.desiredTarget.copy(this.homeCenter)
      this.desiredDistance = this.homeDistance
    }
  }

  pick(clientX: number, clientY: number): NeuralNode | undefined {
    if (this.disposed) {
      return undefined
    }
    const bounds = this.renderer.domElement.getBoundingClientRect()
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    ) {
      return undefined
    }

    this.pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1
    )
    this.root.updateMatrixWorld(true)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.pointer, this.camera)

    const hits = this.raycaster.intersectObjects([this.nodePoints, ...this.hubSprites], false)
    for (const hit of hits) {
      if (!hit.object.visible) {
        continue
      }
      if (hit.object === this.nodePoints && hit.index !== undefined) {
        return this.model.nodes[hit.index]
      }
      const nodeId = hit.object.userData.nodeId as string | undefined
      if (nodeId) {
        return this.getNode(nodeId)
      }
    }
    return undefined
  }

  focus(nodeId?: string) {
    if (this.disposed) {
      return
    }
    const node = nodeId ? this.getNode(nodeId) : undefined
    this.focusedNodeId = node?.id
    this.focusIndices = node
      ? node.kind === 'category'
        ? getCategoryNodeIndices(this.model, node.category)
        : getNodeNeighborhoodIndices(this.model, this.nodeIndexById.get(node.id) ?? 0)
      : undefined
    this.entity.setFocused(node !== undefined)
    const focusCategory = node?.category ?? -1
    const globalGold = node ? 0.06 : 0.92
    this.nodeUniforms.uFocusCategory.value = focusCategory
    this.pulseUniforms.uFocusCategory.value = focusCategory
    this.particleMaterial.uniforms.uFocusCategory.value = focusCategory
    this.nodeUniforms.uGlobalGold.value = globalGold
    this.pulseUniforms.uGlobalGold.value = globalGold
    this.particleMaterial.uniforms.uGlobalGold.value = globalGold
    this.edgeMaterials.forEach((material) => {
      material.uniforms.uFocusCategory.value = focusCategory
      material.uniforms.uGlobalGold.value = globalGold
    })
    this.updateNodeFocusWeights()
    this.hubSprites.forEach((sprite) => {
      const hub = this.getNode(sprite.userData.nodeId as string)
      if (!hub) {
        return
      }
      const active = node?.kind === 'category' && hub.category === node.category
      sprite.material.opacity = node ? (active ? 0.58 : 0.015) : 0.12
      sprite.scale.setScalar(hub.size * (active ? 0.9 : 0.62))
    })
    this.hubRings.forEach((ring) => {
      const hub = this.model.nodes.find(
        (item) => item.kind === 'category' && item.category === ring.category
      )
      ring.material.color.set(node && hub ? hub.color : '#e7b957')
      ring.material.opacity = node
        ? node.kind === 'category' && ring.category === node.category
          ? ring.opacity * 0.8
          : 0.006
        : ring.opacity
    })

    if (!node) {
      this.desiredTarget.copy(this.homeCenter)
      this.desiredDistance = this.homeDistance
      return
    }

    this.root.updateMatrixWorld(true)
    this.fitFocusedBounds()
  }

  setAutoRotate(enabled: boolean) {
    this.autoRotate = enabled
  }

  setReducedMotion(enabled: boolean) {
    this.reducedMotion = enabled
    this.applyMotionState()
  }

  rotate(deltaX: number, deltaY: number) {
    if (this.disposed) {
      return
    }
    this.root.rotation.y += deltaX * 0.005
    this.root.rotation.x = THREE.MathUtils.clamp(this.root.rotation.x + deltaY * 0.005, -1.15, 1.15)
  }

  zoom(delta: number) {
    if (this.disposed) {
      return
    }
    this.desiredDistance = THREE.MathUtils.clamp(
      this.desiredDistance * Math.exp(delta * 0.001),
      this.radius * 0.32,
      this.homeDistance * 2.4
    )
  }

  select(nodeId?: string) {
    if (this.disposed) {
      return
    }
    const node = nodeId ? this.getNode(nodeId) : undefined
    const nodeIndex = node ? this.nodeIndexById.get(node.id) : undefined
    this.selectedNodeId = node?.id
    this.nodeUniforms.uSelectedIndex.value = nodeIndex ?? -1
    this.edgeMaterials.forEach((material) => {
      material.uniforms.uSelectedIndex.value = nodeIndex ?? -1
    })
    this.selectedEdges.visible = node?.kind === 'memory'
    if (node) {
      this.selectedEdgeMaterial.color.set(node.color)
    }
    this.updateSelectedEdges()
  }

  getNodeScreenPosition(nodeId: string): NeuralScreenPosition | undefined {
    const node = this.getNode(nodeId)
    if (!node || this.disposed) {
      return undefined
    }
    this.root.updateMatrixWorld(true)
    this.camera.updateMatrixWorld()
    return this.projectNode(node)
  }

  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.resizeObserver?.disconnect()
    this.overlay?.remove()
    this.hubLabels.clear()
    this.entity?.dispose()
    this.entity?.root.removeFromParent()
    if (this.renderer) this.renderer.debug.onShaderError = null

    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    this.root?.traverse((object) => {
      if (object instanceof THREE.Points || object instanceof THREE.LineSegments) {
        geometries.add(object.geometry)
      }
      if (
        object instanceof THREE.Points ||
        object instanceof THREE.LineSegments ||
        object instanceof THREE.Sprite
      ) {
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
        objectMaterials.forEach((material) => materials.add(material))
      }
    })
    materials.forEach((material) => {
      if (material instanceof THREE.SpriteMaterial && material.map) {
        this.textures.add(material.map)
      }
      material.dispose()
    })
    geometries.forEach((geometry) => geometry.dispose())
    this.textures.forEach((texture) => texture.dispose())
    this.scene.clear()
    this.bloom?.dispose()
    this.output?.dispose()
    this.composer?.dispose()
    this.renderer?.dispose()
    this.renderer?.forceContextLoss()
    this.renderer?.domElement.remove()
    if (this.changedContainerPosition) {
      this.container.style.position = this.originalContainerPosition
    }
  }

  private createNodeUniforms(globalAlpha: number): NodeUniforms {
    return {
      uTime: { value: 0 },
      uMotion: { value: this.reducedMotion ? 0 : 1 },
      uPixelRatio: { value: Math.min(globalThis.devicePixelRatio ?? 1, 2) },
      uFocusCategory: { value: -1 },
      uSelectedIndex: { value: -1 },
      uGlobalAlpha: { value: globalAlpha },
      uGlobalGold: { value: 0.92 }
    }
  }

  private createNodeMaterial(uniforms: NodeUniforms) {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: NODE_VERTEX_SHADER,
      fragmentShader: NODE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  }

  private createNodePoints(nodes: NeuralNode[], material: THREE.ShaderMaterial) {
    const positions = new Float32Array(nodes.length * 3)
    const colors = new Float32Array(nodes.length * 3)
    const sizes = new Float32Array(nodes.length)
    const phases = new Float32Array(nodes.length)
    const categories = new Float32Array(nodes.length)
    const indices = new Float32Array(nodes.length)
    const focusWeights = new Float32Array(nodes.length).fill(1)
    const activeAlphas = new Float32Array(nodes.map((node) => (node.inactive ? 0.36 : 1)))

    nodes.forEach((node, index) => {
      positions.set(node.position, index * 3)
      const color = new THREE.Color(node.color)
      colors.set([color.r, color.g, color.b], index * 3)
      sizes[index] = node.size
      phases[index] = index * 2.399963 + node.category * 0.37
      categories[index] = node.category
      indices[index] = index
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    geometry.setAttribute('aCategory', new THREE.BufferAttribute(categories, 1))
    geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1))
    geometry.setAttribute('aFocusWeight', new THREE.BufferAttribute(focusWeights, 1))
    geometry.setAttribute('aActiveAlpha', new THREE.BufferAttribute(activeAlphas, 1))
    geometry.computeBoundingSphere()
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    return points
  }

  private createDeepParticles() {
    const count = 96
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    const categories = new Float32Array(count)
    const indices = new Float32Array(count)
    const color = new THREE.Color('#7dd3fc')

    for (let index = 0; index < count; index += 1) {
      const randomA = Math.abs(Math.sin(index * 12.9898 + 0.37) * 43758.5453) % 1
      const randomB = Math.abs(Math.sin(index * 39.3467 + 2.11) * 24634.6345) % 1
      const randomC = Math.abs(Math.sin(index * 73.1563 + 4.73) * 56445.2341) % 1
      const azimuth = randomA * Math.PI * 2
      const elevation = Math.acos(randomB * 2 - 1)
      const distance = this.radius * (1.05 + randomC * 0.85)
      positions.set(
        [
          Math.sin(elevation) * Math.cos(azimuth) * distance,
          Math.cos(elevation) * distance * 0.72,
          Math.sin(elevation) * Math.sin(azimuth) * distance
        ],
        index * 3
      )
      colors.set([color.r, color.g, color.b], index * 3)
      sizes[index] = 0.34 + randomB * 0.42
      phases[index] = randomA * Math.PI * 2
      categories[index] = -10
      indices[index] = -1
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    geometry.setAttribute('aCategory', new THREE.BufferAttribute(categories, 1))
    geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1))
    geometry.setAttribute(
      'aFocusWeight',
      new THREE.BufferAttribute(new Float32Array(count).fill(1), 1)
    )
    geometry.setAttribute(
      'aActiveAlpha',
      new THREE.BufferAttribute(new Float32Array(count).fill(1), 1)
    )
    const points = new THREE.Points(geometry, this.particleMaterial)
    points.frustumCulled = false
    return points
  }

  private createEdges() {
    const settings: Record<EdgeKind, { opacity: number; brightness: number }> = {
      membership: { opacity: 0.085, brightness: 0.72 },
      semantic: { opacity: 0.2, brightness: 0.78 },
      visual: { opacity: 0.045, brightness: 0.62 }
    }

    ;(['membership', 'semantic', 'visual'] as const).forEach((kind) => {
      const edges = this.model.edges.filter((edge) => edge.kind === kind)
      const segments = kind === 'visual' ? 4 : kind === 'membership' ? 2 : 1
      const vertexCount = edges.length * segments * 2
      const positions = new Float32Array(vertexCount * 3)
      const colors = new Float32Array(vertexCount * 3)
      const sourceCategories = new Float32Array(vertexCount)
      const targetCategories = new Float32Array(vertexCount)
      const sourceIndices = new Float32Array(vertexCount)
      const targetIndices = new Float32Array(vertexCount)
      edges.forEach((edge, index) => {
        const source = this.model.nodes[edge.source]
        const target = this.model.nodes[edge.target]
        const dx = target.position[0] - source.position[0]
        const dy = target.position[1] - source.position[1]
        const dz = target.position[2] - source.position[2]
        const length = Math.max(0.001, Math.hypot(dx, dy, dz))
        const curve = kind === 'semantic' ? 0 : (index % 2 === 0 ? 1 : -1) * edge.strength * 0.55
        const sideX = (-dz / length) * curve
        const sideZ = (dx / length) * curve
        const sourceColor = new THREE.Color(source.color).multiplyScalar(
          settings[kind].brightness * (0.72 + edge.strength * 0.28)
        )
        const targetColor = new THREE.Color(target.color).multiplyScalar(
          settings[kind].brightness * (0.72 + edge.strength * 0.28)
        )
        const pointAt = (time: number) => {
          const arc = Math.sin(time * Math.PI)
          return [
            source.position[0] + dx * time + sideX * arc,
            source.position[1] + dy * time + arc * curve * 0.24,
            source.position[2] + dz * time + sideZ * arc
          ]
        }
        for (let segment = 0; segment < segments; segment += 1) {
          const vertex = (index * segments + segment) * 2
          const offset = vertex * 3
          positions.set(pointAt(segment / segments), offset)
          positions.set(pointAt((segment + 1) / segments), offset + 3)
          colors.set([sourceColor.r, sourceColor.g, sourceColor.b], offset)
          colors.set([targetColor.r, targetColor.g, targetColor.b], offset + 3)
          sourceCategories.set([source.category, target.category], vertex)
          targetCategories.set([target.category, source.category], vertex)
          sourceIndices.set([edge.source, edge.target], vertex)
          targetIndices.set([edge.target, edge.source], vertex)
        }
      })

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
      geometry.setAttribute('aSourceCategory', new THREE.BufferAttribute(sourceCategories, 1))
      geometry.setAttribute('aTargetCategory', new THREE.BufferAttribute(targetCategories, 1))
      geometry.setAttribute('aSourceIndex', new THREE.BufferAttribute(sourceIndices, 1))
      geometry.setAttribute('aTargetIndex', new THREE.BufferAttribute(targetIndices, 1))
      const material = createEdgeMaterial(kind, settings[kind].opacity)
      this.edgeMaterials.set(kind, material)
      const lines = new THREE.LineSegments(geometry, material)
      this.semanticEdges.set(kind, lines)
      this.root.add(lines)
    })
    this.createInterclusterFibers()
  }

  private createInterclusterFibers() {
    const hubs = this.model.nodes.filter((node) => node.kind === 'category')
    const positions: number[] = []
    const colors: number[] = []
    const segments = 12

    hubs.forEach((hub, index) => {
      const target = hubs[(index + 1) % hubs.length]
      const start = new THREE.Vector3(...hub.position)
      const end = new THREE.Vector3(...target.position)
      const sourceColor = new THREE.Color(hub.color)
      const targetColor = new THREE.Color(target.color)
      for (let strand = 0; strand < 3; strand += 1) {
        const control = start
          .clone()
          .lerp(end, 0.5)
          .multiplyScalar(0.82 + strand * 0.035)
          .add(
            new THREE.Vector3(
              Math.sin(index * 1.7 + strand) * 0.8,
              (strand - 1) * 0.65,
              Math.cos(index * 1.3 + strand) * 0.8
            )
          )
        const curve = new THREE.QuadraticBezierCurve3(start, control, end)
        for (let segment = 0; segment < segments; segment += 1) {
          positions.push(...curve.getPoint(segment / segments).toArray())
          positions.push(...curve.getPoint((segment + 1) / segments).toArray())
          const fromColor = sourceColor.clone().lerp(targetColor, segment / segments)
          const toColor = sourceColor.clone().lerp(targetColor, (segment + 1) / segments)
          colors.push(...fromColor.toArray(), ...toColor.toArray())
        }
      }
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    })
    this.root.add(new THREE.LineSegments(geometry, material))
  }

  private createCircuitTraces() {
    const semantic = this.model.edges.filter((edge) => edge.kind === 'semantic')
    const stride = Math.max(1, Math.floor(semantic.length / 18))
    const positions: number[] = []
    const start = new THREE.Vector3()
    const end = new THREE.Vector3()
    const from = new THREE.Vector3()
    const middle = new THREE.Vector3()
    const to = new THREE.Vector3()
    const direction = new THREE.Vector3()
    const side = new THREE.Vector3()

    for (let index = 0; index < semantic.length; index += stride) {
      const edge = semantic[index]
      start.fromArray(this.model.nodes[edge.source].position)
      end.fromArray(this.model.nodes[edge.target].position)
      direction.subVectors(end, start).normalize()
      side
        .crossVectors(
          direction,
          Math.abs(direction.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
        )
        .normalize()
      from.lerpVectors(start, end, 0.2)
      to.lerpVectors(start, end, 0.8)
      middle.lerpVectors(start, end, 0.5).addScaledVector(side, 0.16 + edge.strength * 0.12)
      positions.push(...from.toArray(), ...middle.toArray(), ...middle.toArray(), ...to.toArray())
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.LineBasicMaterial({
      color: '#f59e0b',
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    })
    this.root.add(new THREE.LineSegments(geometry, material))
  }

  private createHubs() {
    const hubs = this.model.nodes.filter((node) => node.kind === 'category')
    hubs.forEach((hub) => {
      const texture = this.createHubTexture(hub.color)
      this.textures.add(texture)
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.fromArray(hub.position)
      sprite.scale.setScalar(hub.size * 0.62)
      sprite.userData.nodeId = hub.id
      this.hubSprites.push(sprite)
      this.root.add(sprite)
      this.root.add(this.createHubRing(hub, 0))
      this.root.add(this.createHubRing(hub, 1))

      const count = this.model.nodes.filter(
        (node) => node.kind === 'memory' && node.category === hub.category
      ).length
      const label = document.createElement('div')
      label.textContent = `${hub.label}  ${count}`
      label.style.position = 'absolute'
      label.style.left = '0'
      label.style.top = '0'
      label.style.padding = '4px 7px'
      label.style.border = 'none'
      label.style.borderRadius = '3px'
      label.style.background = 'transparent'
      label.style.color = hub.color
      label.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace'
      label.style.fontSize = '10px'
      label.style.lineHeight = '1.2'
      label.style.letterSpacing = '0.12em'
      label.style.whiteSpace = 'nowrap'
      label.style.textShadow = `0 0 12px ${hub.color}80`
      label.style.pointerEvents = 'none'
      label.style.willChange = 'transform'
      this.hubLabels.set(hub.id, label)
      this.overlay.appendChild(label)
    })
  }

  private createHubTexture(colorValue: string) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (context) {
      const srgb = new THREE.Color(colorValue).getHex(THREE.SRGBColorSpace)
      const red = (srgb >> 16) & 0xff
      const green = (srgb >> 8) & 0xff
      const blue = srgb & 0xff
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 62)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.08, `rgba(${red},${green},${blue},0.95)`)
      gradient.addColorStop(0.28, `rgba(${red},${green},${blue},0.3)`)
      gradient.addColorStop(1, `rgba(${red},${green},${blue},0)`)
      context.fillStyle = gradient
      context.fillRect(0, 0, 128, 128)
      context.strokeStyle = `rgba(${red},${green},${blue},0.55)`
      context.lineWidth = 1
      context.beginPath()
      context.arc(64, 64, 27, 0.2, Math.PI * 1.65)
      context.stroke()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    return texture
  }

  private createHubRing(hub: NeuralNode, layer: number) {
    const positions: number[] = []
    const segments = 72
    const radius = hub.size * (0.24 + layer * 0.1)
    const arc = Math.PI * (layer === 0 ? 1.68 : 1.25)
    const start = hub.category * 0.73 + layer * 1.4
    for (let index = 0; index < segments; index += 1) {
      const angleA = start + (index / segments) * arc
      const angleB = start + ((index + 1) / segments) * arc
      positions.push(
        Math.cos(angleA) * radius,
        Math.sin(angleA) * radius,
        0,
        Math.cos(angleB) * radius,
        Math.sin(angleB) * radius,
        0
      )
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.LineBasicMaterial({
      color: '#e7b957',
      transparent: true,
      opacity: layer === 0 ? 0.2 : 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    })
    const ring = new THREE.LineSegments(geometry, material)
    ring.position.fromArray(hub.position)
    ring.rotation.set(0.45 + hub.category * 0.13, hub.category * 0.57, layer * 0.8)
    this.hubRings.push({ category: hub.category, material, opacity: material.opacity })
    return ring
  }

  private createPulseGeometry() {
    const edges = this.model.edges.filter((edge) => edge.kind === 'semantic')
    const positions = new Float32Array(edges.length * 3)
    const starts = new Float32Array(edges.length * 3)
    const ends = new Float32Array(edges.length * 3)
    const colors = new Float32Array(edges.length * 3)
    const sizes = new Float32Array(edges.length)
    const phases = new Float32Array(edges.length)
    const speeds = new Float32Array(edges.length)
    const categories = new Float32Array(edges.length)

    edges.forEach((edge, index) => {
      const source = this.model.nodes[edge.source]
      const target = this.model.nodes[edge.target]
      starts.set(source.position, index * 3)
      ends.set(target.position, index * 3)
      const color = new THREE.Color(source.color).lerp(new THREE.Color(target.color), 0.5)
      colors.set([color.r, color.g, color.b], index * 3)
      sizes[index] = 0.8 + edge.strength * 0.55
      phases[index] = (index * 0.61803398875) % 1
      speeds[index] = 0.055 + edge.strength * 0.08
      categories[index] = source.category
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 3))
    geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    geometry.setAttribute('aCategory', new THREE.BufferAttribute(categories, 1))
    return geometry
  }

  private updateSelectedEdges() {
    const nodeIndex = this.selectedNodeId ? this.nodeIndexById.get(this.selectedNodeId) : undefined
    if (nodeIndex === undefined) {
      this.selectedEdgeGeometry.setDrawRange(0, 0)
      return
    }

    const edges = this.model.semanticNeighbors
      ? this.model.semanticNeighbors(nodeIndex).map((target) => ({ source: nodeIndex, target }))
      : this.model.edges.filter(
          (edge) =>
            edge.kind === 'semantic' && (edge.source === nodeIndex || edge.target === nodeIndex)
        )
    edges.forEach((edge, index) => {
      this.selectedEdgePosition.array.set(this.model.nodes[edge.source].position, index * 6)
      this.selectedEdgePosition.array.set(this.model.nodes[edge.target].position, index * 6 + 3)
    })
    this.selectedEdgePosition.needsUpdate = true
    this.selectedEdgeGeometry.setDrawRange(0, edges.length * 2)
  }

  private updateLabels() {
    this.hubLabels.forEach((label, nodeId) => {
      const node = this.getNode(nodeId)
      if (!node) {
        label.style.display = 'none'
        return
      }
      const position = this.projectNode(node)
      if (!position.visible) {
        label.style.display = 'none'
        return
      }
      const focusedCategory = this.nodeUniforms.uFocusCategory.value
      const visible = focusedCategory < 0 ? true : focusedCategory === node.category
      if (!visible) {
        label.style.display = 'none'
        return
      }
      label.style.display = 'block'
      label.style.opacity = focusedCategory < 0 ? '0.48' : '0.94'
      label.style.color = focusedCategory < 0 ? '#c9a86a' : node.color
      label.style.transform = `translate3d(${position.x}px, ${position.y - 18}px, 0) translate(-50%, -100%)`
    })
  }

  private projectNode(node: NeuralNode): NeuralScreenPosition {
    this.projection
      .fromArray(node.position)
      .applyMatrix4(this.root.matrixWorld)
      .project(this.camera)
    const x = (this.projection.x * 0.5 + 0.5) * this.width
    const y = (-this.projection.y * 0.5 + 0.5) * this.height
    return {
      x,
      y,
      visible:
        this.projection.z >= -1 &&
        this.projection.z <= 1 &&
        x >= 0 &&
        x <= this.width &&
        y >= 0 &&
        y <= this.height
    }
  }

  private applyMotionState() {
    const motion = this.reducedMotion ? 0 : 1
    this.nodeUniforms.uMotion.value = motion
    this.particleMaterial.uniforms.uMotion.value = motion
    this.pulsePoints.visible = !this.reducedMotion
  }

  private updateNodeFocusWeights() {
    const attribute = this.nodePoints.geometry.getAttribute('aFocusWeight') as THREE.BufferAttribute
    const focused = this.focusedNodeId ? this.getNode(this.focusedNodeId) : undefined
    const focusedIndex = focused ? this.nodeIndexById.get(focused.id) : undefined
    const included = new Set(this.focusIndices)
    this.model.nodes.forEach((node, index) => {
      const weight = !focused
        ? 1
        : index === focusedIndex ||
            (focused.kind === 'category' && node.category === focused.category)
          ? 1
          : included.has(index)
            ? 0.55
            : 0.12
      attribute.setX(index, weight)
    })
    attribute.needsUpdate = true
  }

  private calculateBounds() {
    const box = new THREE.Box3()
    this.model.nodes.forEach((node) => box.expandByPoint(new THREE.Vector3(...node.position)))
    const sphere = box.isEmpty() ? new THREE.Sphere() : box.getBoundingSphere(new THREE.Sphere())
    this.homeCenter.fromArray(this.entity.bounds.center)
    this.radius = Math.max(this.entity.bounds.radius, sphere.radius)
  }

  private calculateHomeDistance() {
    return (
      calculateFitDistance(this.radius, this.camera.fov, this.width, this.height, 16, 0.96) * 1.1
    )
  }

  private getFocusedBounds() {
    if (!this.focusIndices) {
      return undefined
    }
    return calculateCameraBounds(
      this.focusIndices.map((index) => [...this.model.nodes[index].position])
    )
  }

  private updateFocusTarget() {
    const bounds = this.getFocusedBounds()
    if (!bounds) {
      return
    }
    this.desiredTarget.fromArray(bounds.center).applyMatrix4(this.root.matrixWorld)
  }

  private fitFocusedBounds() {
    const bounds = this.getFocusedBounds()
    if (!bounds) {
      return
    }
    this.updateFocusTarget()
    const radius = Math.max(1.2, bounds.radius + 0.45)
    this.desiredDistance = calculateFitDistance(
      radius,
      this.camera.fov,
      this.width,
      this.height,
      24,
      1.08
    )
  }

  private updateCamera() {
    this.camera.position
      .copy(this.cameraDirection)
      .multiplyScalar(this.currentDistance)
      .add(this.currentTarget)
    this.camera.lookAt(this.currentTarget)
    const far = Math.max(320, this.currentDistance + this.radius * 4)
    if (this.camera.far !== far) {
      this.camera.far = far
      this.camera.updateProjectionMatrix()
    }
    this.camera.updateMatrixWorld()
  }

  private getNode(nodeId: string) {
    const index = this.nodeIndexById.get(nodeId)
    return index === undefined ? undefined : this.model.nodes[index]
  }
}
