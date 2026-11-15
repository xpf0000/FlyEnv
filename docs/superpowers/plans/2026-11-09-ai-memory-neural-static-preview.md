# AI Memory Three.js Static Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive Three.js-only preview of a living 3D neural memory network with deterministic simulated memories, without changing the existing plugin behavior.

**Architecture:** A pure seeded model creates category hubs, memory neurons and explicit semantic/visual edges. A Three.js scene owns batched geometry, shaders, picking and resource disposal; DOM overlays provide labels, details and controls. Vite serves the isolated page from `tmp/ai-memory-neural-preview/`.

**Tech Stack:** Three.js, TypeScript, Vite, HTML/CSS, Node.js test runner, Electron for screenshot verification.

---

## File map

- Modify `package.json` and `yarn.lock`: add the local `three` runtime dependency.
- Create `tmp/ai-memory-neural-preview/model.ts`: seeded categories, nodes, edges and layout.
- Create `tmp/ai-memory-neural-preview/model.test.ts`: deterministic graph invariants.
- Create `tmp/ai-memory-neural-preview/scene.ts`: WebGL scene, batched rendering, animation, picking and disposal.
- Create `tmp/ai-memory-neural-preview/main.ts`: UI state, focus transitions and pointer interactions.
- Create `tmp/ai-memory-neural-preview/index.html` and `style.css`: preview shell and holographic HUD.
- Create `tmp/ai-memory-neural-preview/capture.ts`: temporary Electron capture driver.

No existing AI Memory source, storage, MCP or business logic changes are allowed in this preview.

### Task 1: Dependency and deterministic neural model

**Files:**
- Modify: `package.json`, `yarn.lock`
- Create: `tmp/ai-memory-neural-preview/model.ts`
- Test: `tmp/ai-memory-neural-preview/model.test.ts`

- [ ] **Step 1: Add the approved local dependency**

Run `yarn add three`. Expected: `three` appears in `dependencies` and only the corresponding lock entries change.

- [ ] **Step 2: Write failing model tests**

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildNeuralModel, CATEGORY_COUNT, MEMORY_COUNT } from './model'

test('seeded neural model is stable and separates semantic from visual edges', () => {
  const first = buildNeuralModel()
  assert.deepEqual(first, buildNeuralModel())
  assert.equal(first.nodes.filter((node) => node.kind === 'category').length, CATEGORY_COUNT)
  assert.equal(first.nodes.filter((node) => node.kind === 'memory').length, MEMORY_COUNT)
  assert.ok(first.edges.some((edge) => edge.kind === 'semantic'))
  assert.ok(first.edges.some((edge) => edge.kind === 'visual'))
  assert.ok(first.edges.every((edge) => edge.source !== edge.target))
  assert.ok(first.nodes.every((node) => node.position.every(Number.isFinite)))
})
```

Run `npx tsx --test tmp/ai-memory-neural-preview/model.test.ts`. Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the model**

Export `CATEGORY_COUNT = 8`, `MEMORY_COUNT = 160`, category metadata using the document colors, and these types:

```ts
export type NeuralNode = {
  id: string
  kind: 'category' | 'memory'
  category: number
  label: string
  summary: string
  tags: string[]
  color: string
  size: number
  position: [number, number, number]
}
export type NeuralEdge = {
  source: number
  target: number
  kind: 'membership' | 'semantic' | 'visual'
  strength: number
}
```

Use a seeded Mulberry32 generator. Place hubs with a golden-angle sequence plus seeded radial/depth variation; place neurons in anisotropic local clouds around hubs with some central filaments. Connect every neuron to its hub with `membership`, connect same-topic/cross-category neurons with `semantic`, and add seeded short-range fibers with `visual`. Never label visual fibers as semantic relationships.

- [ ] **Step 4: Verify model tests**

Run `npx tsx --test tmp/ai-memory-neural-preview/model.test.ts`. Expected: 1 passing test, 0 failures.

### Task 2: Batched Three.js neural scene

**Files:**
- Create: `tmp/ai-memory-neural-preview/scene.ts`

- [ ] **Step 1: Implement shared GPU resources**

Create `NeuralScene` with `WebGLRenderer`, perspective camera and a root `Group`. Use shared `BufferGeometry` plus `ShaderMaterial` for memory points, with per-node position, color, size and phase attributes. The vertex shader applies subtle sinusoidal displacement and perspective point sizing; the fragment shader draws a soft core and halo without textures.

```ts
const vertex = `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uMotion;
  varying vec3 vColor;
  void main() {
    vec3 p = position;
    p += normalize(p + vec3(0.001)) * sin(uTime * 0.7 + aPhase) * 0.018 * uMotion;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (220.0 / max(1.0, -mv.z));
    vColor = aColor;
  }
`
```

Use `LineSegments` for membership/semantic/visual groups with independent opacity. Add a separate small `Points` buffer for data pulses traveling along semantic edges. Do not create one mesh or DOM element per memory.

- [ ] **Step 2: Add hubs and depth detail**

Each hub uses a sprite core, two low-opacity structural rings and a short HTML label positioned from its projected world coordinates. Add sparse deep-space points and fine amber circuit traces, but no solid sphere, brain, central logo or orbit UI. Hub pulse and fiber opacity remain subtle.

- [ ] **Step 3: Add picking and focus state**

Expose `render(time)`, `resize(width,height)`, `pick(clientX,clientY)`, `focus(nodeId?)`, `setAutoRotate(enabled)`, `setReducedMotion(enabled)` and `dispose()`. Use a `Raycaster` with a tuned `Points.threshold`, then resolve the nearest visible hit. Focus smoothly interpolates camera target and distance; selected semantic edges brighten while visual fibers remain decorative. Pause rendering when `document.hidden` and dispose every geometry, material, texture, renderer and observer.

### Task 3: Preview HUD and interactions

**Files:**
- Create: `tmp/ai-memory-neural-preview/index.html`
- Create: `tmp/ai-memory-neural-preview/style.css`
- Create: `tmp/ai-memory-neural-preview/main.ts`

- [ ] **Step 1: Build the standalone shell**

The page includes a WebGL container, minimal header, live node/connection counters, auto-rotation and reduced-motion buttons, zoom/reset controls, a category rail, hover card, selection drawer and a small legend distinguishing semantic links from visual fibers. Load only local `/main.ts` through Vite.

- [ ] **Step 2: Implement pointer and camera controls**

Track one active pointer and movement threshold. Drag rotates the root network; wheel changes camera distance; single click selects without dragging; double click focuses. Category click focuses and lists only that category's simulated memories. Reset restores the global view. Escape closes selection. `pointercancel` and lost capture always clear drag state.

- [ ] **Step 3: Apply the visual system**

Use deep navy transparency, fine borders, compact monospaced telemetry and category colors. Keep long summaries inside the drawer, never in the 3D scene. Responsive layout collapses the category rail above the scene on narrow screens. Reduced motion disables drift, pulses and automatic rotation.

### Task 4: Browser verification and preview handoff

**Files:**
- Create: `tmp/ai-memory-neural-preview/capture.ts`

- [ ] **Step 1: Run static checks and model tests**

Run `npx tsx --test tmp/ai-memory-neural-preview/model.test.ts`, `npx eslint tmp/ai-memory-neural-preview/*.ts`, and `git diff --check`. Expected: all pass.

- [ ] **Step 2: Start Vite and exercise real WebGL**

Start `npx vite tmp/ai-memory-neural-preview --host 127.0.0.1 --port 0` as a background task and read the actual local URL. Use Electron to open the page, wait for `window.__NEURAL_PREVIEW_READY__`, capture the initial view, click a category, drag/rotate, zoom, select a memory, toggle motion and capture the focused view. Assert no page errors and no WebGL console errors.

The capture driver writes `preview-global.png` and `preview-focus.png` under the temporary preview directory. Read both images before presenting the preview.

- [ ] **Step 3: Deliver the running preview**

Report the actual local URL and the screenshot paths. Leave the preview server running for user review, state that it uses simulated data, and do not merge preview dependency changes into `master` without explicit user approval.
