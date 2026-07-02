import {
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  Vector3,
} from '@babylonjs/core'
import './style.css'
import { SceneManager } from './scenes/sceneManager'
import { SCENES } from './scenes/sceneRegistry'
import { createXrRuntime } from './xr/xrRuntime'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root not found.')
}

const sceneButtons = SCENES.map(
  (scene, index) =>
    `<button class="scene-chip" data-scene-index="${index}">${index + 1}. ${scene.title}</button>`,
).join('')

app.innerHTML = `
<div class="viewport-shell">
  <canvas id="render-canvas" aria-label="3D immersive scene viewer"></canvas>

  <aside class="scene-rail" aria-label="Scene Selector">
    <div class="scene-strip">${sceneButtons}</div>
  </aside>

  <section class="hud" aria-label="Scene Controls Overlay">
    <header class="hud-head">
      <p class="eyebrow">Midsummer Night 3D</p>
      <h1>Immersive Scene Platform</h1>
    </header>

    <div class="actions">
      <button id="toggle-vr" class="action">Enter VR</button>
      <button id="reset-view" class="action muted">Reset View</button>
    </div>
  </section>

  <span id="status-pill" class="status">Initializing...</span>
</div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#render-canvas')
const statusPill = document.querySelector<HTMLSpanElement>('#status-pill')
const toggleVrButton = document.querySelector<HTMLButtonElement>('#toggle-vr')
const resetViewButton = document.querySelector<HTMLButtonElement>('#reset-view')
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.scene-chip'))

if (!canvas || !statusPill || !toggleVrButton || !resetViewButton) {
  throw new Error('UI initialization failed.')
}

const setStatus = (message: string): void => {
  statusPill.textContent = message
}

const syncActiveChip = (index: number): void => {
  chips.forEach((chip, currentIndex) => {
    chip.classList.toggle('active', currentIndex === index)
  })
}

const engine = new Engine(canvas, true)
const scene = new Scene(engine)
scene.clearColor = new Color4(0.03, 0.05, 0.09, 1)

const camera = new ArcRotateCamera(
  'fallback-camera',
  Math.PI / 2,
  Math.PI / 2.4,
  0.2,
  new Vector3(0, 1.4, 0),
  scene,
)
camera.attachControl(canvas, true)
camera.lowerBetaLimit = 0.08
camera.upperBetaLimit = Math.PI - 0.08
camera.minZ = 0.01
camera.wheelDeltaPercentage = 0.01

const light = new HemisphericLight('main-light', new Vector3(0, 1, 0), scene)
light.intensity = 0.95

const teleportFloor = MeshBuilder.CreateGround(
  'teleport-floor',
  { width: 70, height: 70 },
  scene,
)
teleportFloor.isVisible = false
teleportFloor.isPickable = true

const sceneManager = new SceneManager(scene, camera, setStatus)

const updateVrButtonState = (inSession: boolean): void => {
  toggleVrButton.textContent = inSession ? 'Exit VR' : 'Enter VR'
  toggleVrButton.classList.toggle('live', inSession)
}

const xrRuntime = await createXrRuntime({
  scene,
  floorMeshes: [teleportFloor],
  reportStatus: setStatus,
  onSessionStateChange: updateVrButtonState,
})

if (!xrRuntime.supported) {
  toggleVrButton.disabled = true
  toggleVrButton.textContent = 'VR Unavailable'
  setStatus(`Fallback mode: ${xrRuntime.reason}`)
} else {
  updateVrButtonState(false)
}

const loadScene = async (index: number): Promise<void> => {
  try {
    const active = await sceneManager.loadSceneByIndex(index)
    syncActiveChip(index)
    setStatus(`Viewing ${active.title}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scene loading error.'
    setStatus(`Scene load failed: ${message}`)
  }
}

for (const chip of chips) {
  chip.addEventListener('click', () => {
    const indexValue = chip.dataset.sceneIndex
    if (!indexValue) {
      return
    }
    const parsed = Number(indexValue)
    void loadScene(parsed)
  })
}

toggleVrButton.addEventListener('click', async () => {
  if (!xrRuntime.supported) {
    return
  }

  if (xrRuntime.inSession) {
    await xrRuntime.exitXR()
    return
  }

  await xrRuntime.enterXR()
})

resetViewButton.addEventListener('click', () => {
  if (xrRuntime.inSession) {
    xrRuntime.resetReferenceSpace()
    return
  }

  sceneManager.resetView()
})

await loadScene(0)

engine.runRenderLoop(() => {
  scene.render()
})

window.addEventListener('resize', () => {
  engine.resize()
})
