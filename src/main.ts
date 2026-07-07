import {
  AbstractMesh,
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  Vector3,
} from '@babylonjs/core'
import './style.css'
import { CharacterManager, type CharacterInstanceState } from './characters/characterManager'
import { CHARACTERS } from './characters/characterRegistry'
import { SceneManager } from './scenes/sceneManager'
import { SCENES } from './scenes/sceneRegistry'
import { createXrRuntime } from './xr/xrRuntime'

const CHARACTER_LAYOUT_STORAGE_KEY = 'midsummer-night-3d-character-layout-v1'

type CharacterLayoutStore = Record<string, CharacterInstanceState[]>
type DragMode = 'ground' | 'xy'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root not found.')
}

const sceneButtons = SCENES.map((scene, index) => {
  const imageNumber = index + 1
  return `<button class="scene-chip" data-scene-index="${index}"><span class="scene-chip-text">${index + 1}. ${scene.title}</span><img class="scene-thumb" src="/scenes/s${imageNumber}.png" alt="Preview for ${scene.title}" loading="lazy" draggable="false" /></button>`
}).join('')

const characterButtons = CHARACTERS.map((character) => {
  const number = character.id.split('-')[1]
  return `<button class="character-chip" data-character-id="${character.id}" title="C${number}" aria-label="Character ${number}"><img class="character-thumb" src="/figures/c${number}.png" alt="Character ${number} preview" loading="lazy" draggable="false" /><span class="character-chip-label">C${number}</span></button>`
}).join('')

app.innerHTML = `
<div class="viewport-shell">
  <canvas id="render-canvas" aria-label="3D immersive scene viewer"></canvas>

  <div id="loading-screen" class="loading-screen hidden" aria-live="polite" aria-label="Loading">
    <p id="loading-text" class="loading-text">Loading...</p>
    <div class="loading-bars" role="presentation">
      <span></span><span></span><span></span><span></span><span></span>
      <span></span><span></span><span></span><span></span><span></span>
    </div>
  </div>

  <aside class="scene-rail" aria-label="Scene Selector">
    <div class="scene-strip">${sceneButtons}</div>
    <div class="scene-hint" aria-hidden="true">
      <span class="mouse-icon"><span class="mouse-wheel"></span></span>
      <span class="scene-hint-text">Drag mouse to look around</span>
    </div>
  </aside>

  <section class="hud" aria-label="Scene Controls Overlay">
    <header class="hud-head">
      <p class="eyebrow">Midsummer Night's Drunk</p>
      <h1>Immersive Scene Platform</h1>
    </header>

    <div class="actions">
      <button id="toggle-vr" class="action">Enter VR</button>
      <button id="reset-view" class="action muted">Reset View</button>
    </div>
  </section>

  <aside class="character-palette" aria-label="Character Controls">
    <p class="palette-title">Characters</p>
    <div class="character-grid">${characterButtons}</div>
    <div class="character-tools">
      <button id="char-remove" class="action muted mini" type="button">Remove</button>
      <button id="char-reset-all" class="action muted mini" type="button">Reset All</button>
    </div>
    <button id="char-drag-mode" class="action muted mini wide" type="button">Drag: Ground XZ</button>
    <p class="palette-title compact">Controls</p>
    <div class="nudge-panel" aria-label="Game Style Transform Controls">
      <button id="char-rotate-left" class="action muted mini nudge-side rotate-left" type="button" title="Rotate left">↺</button>
      <button class="nudge-btn up" data-nudge="forward" type="button" title="Move forward">↑</button>
      <button id="char-rotate-right" class="action muted mini nudge-side rotate-right" type="button" title="Rotate right">↻</button>
      <button class="nudge-btn left" data-nudge="left" type="button" title="Move left">←</button>
      <button class="nudge-btn center" data-nudge="center" type="button" disabled>●</button>
      <button class="nudge-btn right" data-nudge="right" type="button" title="Move right">→</button>
      <button id="char-scale-down" class="action muted mini nudge-side scale-down" type="button" title="Scale down">－</button>
      <button class="nudge-btn down" data-nudge="backward" type="button" title="Move backward">↓</button>
      <button id="char-scale-up" class="action muted mini nudge-side scale-up" type="button" title="Scale up">＋</button>
    </div>
    <div class="height-controls">
      <button class="action muted mini" id="char-lift-up" type="button" title="Raise character">Lift +</button>
      <button class="action muted mini" id="char-lift-down" type="button" title="Lower character">Lift -</button>
    </div>
    <p id="character-selected" class="palette-info">Selected: none</p>
    <p id="character-tip" class="palette-tip">Pick a character, then use arrows to move, Lift for height, Rotate and Scale for fine adjustment. Press and hold buttons for continuous movement.</p>
  </aside>

  <span id="status-pill" class="status">Initializing...</span>
  <p class="disclaimer">
    Based on <em>Midsummer Night's Drunk</em> (2024), School of Drama, HKAPA. &copy; The Hong Kong Academy for Performing Arts.
    <a href="http://lib.hkapa.edu/bib/991002340223304326" target="_blank" rel="noopener noreferrer">View the original production record</a>.
  </p>
</div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#render-canvas')
const statusPill = document.querySelector<HTMLSpanElement>('#status-pill')
const toggleVrButton = document.querySelector<HTMLButtonElement>('#toggle-vr')
const resetViewButton = document.querySelector<HTMLButtonElement>('#reset-view')
const removeCharacterButton = document.querySelector<HTMLButtonElement>('#char-remove')
const resetCharactersButton = document.querySelector<HTMLButtonElement>('#char-reset-all')
const scaleUpButton = document.querySelector<HTMLButtonElement>('#char-scale-up')
const scaleDownButton = document.querySelector<HTMLButtonElement>('#char-scale-down')
const rotateLeftButton = document.querySelector<HTMLButtonElement>('#char-rotate-left')
const rotateRightButton = document.querySelector<HTMLButtonElement>('#char-rotate-right')
const liftUpButton = document.querySelector<HTMLButtonElement>('#char-lift-up')
const liftDownButton = document.querySelector<HTMLButtonElement>('#char-lift-down')
const dragModeButton = document.querySelector<HTMLButtonElement>('#char-drag-mode')
const nudgeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.nudge-btn[data-nudge]'))
const characterLabel = document.querySelector<HTMLParagraphElement>('#character-selected')
const characterTip = document.querySelector<HTMLParagraphElement>('#character-tip')
const loadingScreen = document.querySelector<HTMLDivElement>('#loading-screen')
const loadingText = document.querySelector<HTMLParagraphElement>('#loading-text')
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.scene-chip'))
const characterChips = Array.from(document.querySelectorAll<HTMLButtonElement>('.character-chip'))

if (
  !canvas ||
  !statusPill ||
  !toggleVrButton ||
  !resetViewButton ||
  !removeCharacterButton ||
  !resetCharactersButton ||
  !scaleUpButton ||
  !scaleDownButton ||
  !rotateLeftButton ||
  !rotateRightButton ||
  !liftUpButton ||
  !liftDownButton ||
  !dragModeButton ||
  !characterLabel ||
  !characterTip ||
  !loadingScreen ||
  !loadingText
) {
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
const characterManager = new CharacterManager(scene, setStatus)

let currentSceneId: string | null = null
let selectedCharacterInstanceId: string | null = null
let draggingCharacterInstanceId: string | null = null
let dragMode: DragMode = 'ground'
let loadingLockCount = 0

const beginLoading = (message: string): void => {
  loadingLockCount += 1
  loadingText.textContent = message
  loadingScreen.classList.remove('hidden')
}

const endLoading = (): void => {
  loadingLockCount = Math.max(0, loadingLockCount - 1)
  if (loadingLockCount === 0) {
    loadingScreen.classList.add('hidden')
  }
}

const uiIsLocked = (): boolean => loadingLockCount > 0

const readCharacterLayoutStore = (): CharacterLayoutStore => {
  try {
    const value = localStorage.getItem(CHARACTER_LAYOUT_STORAGE_KEY)
    if (!value) {
      return {}
    }

    const parsed = JSON.parse(value) as CharacterLayoutStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeCharacterLayoutStore = (store: CharacterLayoutStore): void => {
  localStorage.setItem(CHARACTER_LAYOUT_STORAGE_KEY, JSON.stringify(store))
}

const persistSceneCharacters = (sceneId: string): void => {
  const store = readCharacterLayoutStore()
  store[sceneId] = characterManager.getSerializedState()
  writeCharacterLayoutStore(store)
}

const clearAllStoredCharacterLayouts = (): void => {
  writeCharacterLayoutStore({})
}

const setSelectedCharacter = (instanceId: string | null): void => {
  selectedCharacterInstanceId = instanceId
  characterManager.setSelected(instanceId)

  const label = instanceId ? characterManager.getInstanceLabel(instanceId) : null
  characterLabel.textContent = label ? `Selected: ${label}` : 'Selected: none'

  const hasSelection = Boolean(instanceId)
  removeCharacterButton.disabled = !hasSelection
  scaleUpButton.disabled = !hasSelection
  scaleDownButton.disabled = !hasSelection
  rotateLeftButton.disabled = !hasSelection
  rotateRightButton.disabled = !hasSelection
  liftUpButton.disabled = !hasSelection
  liftDownButton.disabled = !hasSelection
  for (const button of nudgeButtons) {
    button.disabled = !hasSelection
  }
}

const syncDragModeUi = (): void => {
  dragModeButton.textContent = dragMode === 'ground' ? 'Drag: Ground XZ' : 'Drag: XY'
}

const getGroundPointerPosition = (): Vector3 | null => {
  const pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh === teleportFloor)
  if (!pick?.hit || !pick.pickedPoint) {
    return null
  }
  return pick.pickedPoint.clone()
}

const getDefaultCharacterSpawnPosition = (): Vector3 => {
  const groundOrigin = new Vector3(camera.target.x, 0, camera.target.z)
  const forwardDirection = camera.getDirection(Vector3.Forward())
  forwardDirection.y = 0

  if (forwardDirection.lengthSquared() < 0.00001) {
    forwardDirection.set(0, 0, 1)
  } else {
    forwardDirection.normalize()
  }

  const rightDirection = camera.getDirection(Vector3.Right())
  rightDirection.y = 0
  if (rightDirection.lengthSquared() < 0.00001) {
    rightDirection.set(1, 0, 0)
  } else {
    rightDirection.normalize()
  }

  const activeCharacterCount = characterManager.getSerializedState().length
  const lane = (activeCharacterCount % 3) - 1
  const row = Math.floor(activeCharacterCount / 3)

  const baseDistance = Math.max(camera.radius * 10, 1.9)
  const laneSpacing = Math.max(camera.radius * 2.4, 0.45)
  const rowSpacing = Math.max(camera.radius * 2.1, 0.4)

  const depthOffset = baseDistance + row * rowSpacing
  const sideOffset = lane * laneSpacing

  return groundOrigin
    .add(forwardDirection.scale(depthOffset))
    .add(rightDirection.scale(sideOffset))
}

setSelectedCharacter(null)
syncDragModeUi()

const updateVrButtonState = (inSession: boolean): void => {
  toggleVrButton.textContent = inSession ? 'Exit VR' : 'Enter VR'
  toggleVrButton.classList.toggle('live', inSession)

  const locked = inSession
  for (const chip of characterChips) {
    chip.disabled = locked
  }

  removeCharacterButton.disabled = locked || !selectedCharacterInstanceId
  scaleUpButton.disabled = locked || !selectedCharacterInstanceId
  scaleDownButton.disabled = locked || !selectedCharacterInstanceId
  rotateLeftButton.disabled = locked || !selectedCharacterInstanceId
  rotateRightButton.disabled = locked || !selectedCharacterInstanceId
  liftUpButton.disabled = locked || !selectedCharacterInstanceId
  liftDownButton.disabled = locked || !selectedCharacterInstanceId
  for (const button of nudgeButtons) {
    button.disabled = locked || !selectedCharacterInstanceId
  }
  dragModeButton.disabled = locked
  resetCharactersButton.disabled = locked

  characterTip.textContent = locked
    ? 'Character editing is paused during immersive session.'
    : 'Pick a character, then use arrows to move, Lift for height, Rotate and Scale for fine adjustment. Press and hold buttons for continuous movement.'
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
  beginLoading('Loading scene...')

  try {
    clearAllStoredCharacterLayouts()
    setSelectedCharacter(null)
    characterManager.clearCharacters()

    const active = await sceneManager.loadSceneByIndex(index)
    currentSceneId = active.id

    syncActiveChip(index)
    setStatus(`Viewing ${active.title}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scene loading error.'
    setStatus(`Scene load failed: ${message}`)
  } finally {
    endLoading()
  }
}

scene.onPointerObservable.add((pointerInfo) => {
  if (xrRuntime.inSession || uiIsLocked()) {
    return
  }

  if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
    const event = pointerInfo.event
    if (event.button !== 0) {
      return
    }

    const pickedMesh = pointerInfo.pickInfo?.pickedMesh
    if (!pickedMesh) {
      setSelectedCharacter(null)
      return
    }

    const instanceId = characterManager.getCharacterInstanceIdFromMesh(pickedMesh as AbstractMesh)
    if (!instanceId) {
      setSelectedCharacter(null)
      return
    }

    draggingCharacterInstanceId = instanceId
    setSelectedCharacter(instanceId)
    return
  }

  if (pointerInfo.type === PointerEventTypes.POINTERMOVE && draggingCharacterInstanceId) {
    if (dragMode === 'ground') {
      const target = getGroundPointerPosition()
      if (!target) {
        return
      }

      characterManager.moveCharacter(draggingCharacterInstanceId, target)
      return
    }

    const moveEvent = pointerInfo.event as PointerEvent
    const horizontalDelta = moveEvent.movementX
    const verticalDelta = moveEvent.movementY

    if (horizontalDelta === 0 && verticalDelta === 0) {
      return
    }

    const sensitivity = Math.max(camera.radius * 0.0024, 0.002)
    const rightDirection = camera.getDirection(Vector3.Right())
    const movement = rightDirection.scale(horizontalDelta * sensitivity)
    movement.y += -verticalDelta * sensitivity
    characterManager.moveCharacterByDelta(draggingCharacterInstanceId, movement)
    return
  }

  if (pointerInfo.type === PointerEventTypes.POINTERUP && draggingCharacterInstanceId) {
    if (currentSceneId) {
      persistSceneCharacters(currentSceneId)
    }
    draggingCharacterInstanceId = null
  }
})

canvas.addEventListener(
  'wheel',
  (event) => {
    if (!selectedCharacterInstanceId || xrRuntime.inSession || uiIsLocked()) {
      return
    }

    event.preventDefault()
    const direction = event.deltaY > 0 ? -1 : 1
    const nextScale = characterManager.scaleCharacter(selectedCharacterInstanceId, direction * 0.08)
    if (nextScale !== null) {
      setStatus(`Character scale: ${nextScale.toFixed(2)}x`)
      if (currentSceneId) {
        persistSceneCharacters(currentSceneId)
      }
    }
  },
  { passive: false },
)

for (const characterChip of characterChips) {
  characterChip.addEventListener('click', async () => {
    if (xrRuntime.inSession || uiIsLocked()) {
      return
    }

    const characterId = characterChip.dataset.characterId
    if (!characterId) {
      return
    }

    const spawnPosition = getDefaultCharacterSpawnPosition()

    beginLoading('Loading character model...')

    try {
      const state = await characterManager.spawnCharacter(characterId, spawnPosition)
      setSelectedCharacter(state.instanceId)
      if (currentSceneId) {
        persistSceneCharacters(currentSceneId)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to spawn character.'
      setStatus(message)
    } finally {
      endLoading()
    }
  })
}

removeCharacterButton.addEventListener('click', () => {
  if (!selectedCharacterInstanceId || xrRuntime.inSession || uiIsLocked()) {
    return
  }

  characterManager.removeCharacter(selectedCharacterInstanceId)
  setSelectedCharacter(null)
  if (currentSceneId) {
    persistSceneCharacters(currentSceneId)
  }
})

resetCharactersButton.addEventListener('click', () => {
  if (xrRuntime.inSession || uiIsLocked()) {
    return
  }

  characterManager.clearCharacters()
  setSelectedCharacter(null)
  if (currentSceneId) {
    persistSceneCharacters(currentSceneId)
  }
  setStatus('All characters cleared from this scene.')
})

dragModeButton.addEventListener('click', () => {
  if (xrRuntime.inSession || uiIsLocked()) {
    return
  }

  dragMode = dragMode === 'ground' ? 'xy' : 'ground'
  syncDragModeUi()
  setStatus(dragMode === 'ground' ? 'Drag mode set to ground XZ.' : 'Drag mode set to XY.')
})

const nudgeSelectedCharacter = (kind: string): void => {
  if (!selectedCharacterInstanceId || xrRuntime.inSession || uiIsLocked()) {
    return
  }

  const planarStep = Math.max(camera.radius * 0.035, 0.025)
  const verticalStep = Math.max(camera.radius * 0.03, 0.02)
  const liftDownStep = verticalStep * 1.6

  const forwardDirection = camera.getDirection(Vector3.Forward())
  forwardDirection.y = 0
  if (forwardDirection.lengthSquared() > 0.00001) {
    forwardDirection.normalize()
  }

  const rightDirection = camera.getDirection(Vector3.Right())
  rightDirection.y = 0
  if (rightDirection.lengthSquared() > 0.00001) {
    rightDirection.normalize()
  }

  let delta = Vector3.Zero()
  if (kind === 'forward') {
    delta = forwardDirection.scale(planarStep)
  } else if (kind === 'backward') {
    delta = forwardDirection.scale(-planarStep)
  } else if (kind === 'left') {
    delta = rightDirection.scale(-planarStep)
  } else if (kind === 'right') {
    delta = rightDirection.scale(planarStep)
  } else if (kind === 'liftUp') {
    delta = new Vector3(0, verticalStep, 0)
  } else if (kind === 'liftDown') {
    delta = new Vector3(0, -liftDownStep, 0)
  }

  if (delta.lengthSquared() === 0) {
    return
  }

  characterManager.moveCharacterByDelta(selectedCharacterInstanceId, delta)
  if (currentSceneId) {
    persistSceneCharacters(currentSceneId)
  }
}

let nudgeIntervalId: ReturnType<typeof setInterval> | null = null

const beginNudge = (kind: string): void => {
  nudgeSelectedCharacter(kind)

  if (nudgeIntervalId) {
    clearInterval(nudgeIntervalId)
  }
  nudgeIntervalId = setInterval(() => {
    nudgeSelectedCharacter(kind)
  }, 95)
}

const stopNudge = (): void => {
  if (!nudgeIntervalId) {
    return
  }
  clearInterval(nudgeIntervalId)
  nudgeIntervalId = null
}

for (const button of nudgeButtons) {
  const kind = button.dataset.nudge
  if (!kind) {
    continue
  }

  button.addEventListener('pointerdown', (event) => {
    if (button.disabled) {
      return
    }
    event.preventDefault()
    beginNudge(kind)
  })

  button.addEventListener('pointerup', stopNudge)
  button.addEventListener('pointercancel', stopNudge)
  button.addEventListener('pointerleave', stopNudge)
}

liftUpButton.addEventListener('pointerdown', (event) => {
  if (liftUpButton.disabled) {
    return
  }
  event.preventDefault()
  beginNudge('liftUp')
})

liftDownButton.addEventListener('pointerdown', (event) => {
  if (liftDownButton.disabled) {
    return
  }
  event.preventDefault()
  beginNudge('liftDown')
})

liftUpButton.addEventListener('pointerup', stopNudge)
liftUpButton.addEventListener('pointercancel', stopNudge)
liftUpButton.addEventListener('pointerleave', stopNudge)
liftDownButton.addEventListener('pointerup', stopNudge)
liftDownButton.addEventListener('pointercancel', stopNudge)
liftDownButton.addEventListener('pointerleave', stopNudge)

scaleUpButton.addEventListener('click', () => {
  if (!selectedCharacterInstanceId || xrRuntime.inSession || uiIsLocked()) {
    return
  }

  const nextScale = characterManager.scaleCharacter(selectedCharacterInstanceId, 0.08)
  if (nextScale !== null) {
    setStatus(`Character scale: ${nextScale.toFixed(2)}x`)
    if (currentSceneId) {
      persistSceneCharacters(currentSceneId)
    }
  }
})

scaleDownButton.addEventListener('click', () => {
  if (!selectedCharacterInstanceId || xrRuntime.inSession || uiIsLocked()) {
    return
  }

  const nextScale = characterManager.scaleCharacter(selectedCharacterInstanceId, -0.08)
  if (nextScale !== null) {
    setStatus(`Character scale: ${nextScale.toFixed(2)}x`)
    if (currentSceneId) {
      persistSceneCharacters(currentSceneId)
    }
  }
})

rotateLeftButton.addEventListener('click', () => {
  if (!selectedCharacterInstanceId || xrRuntime.inSession || uiIsLocked()) {
    return
  }

  const nextRotation = characterManager.rotateCharacter(selectedCharacterInstanceId, -Math.PI / 8)
  if (nextRotation !== null) {
    setStatus(`Character rotation: ${(nextRotation * 180 / Math.PI).toFixed(0)} deg`)
    if (currentSceneId) {
      persistSceneCharacters(currentSceneId)
    }
  }
})

rotateRightButton.addEventListener('click', () => {
  if (!selectedCharacterInstanceId || xrRuntime.inSession || uiIsLocked()) {
    return
  }

  const nextRotation = characterManager.rotateCharacter(selectedCharacterInstanceId, Math.PI / 8)
  if (nextRotation !== null) {
    setStatus(`Character rotation: ${(nextRotation * 180 / Math.PI).toFixed(0)} deg`)
    if (currentSceneId) {
      persistSceneCharacters(currentSceneId)
    }
  }
})

for (const chip of chips) {
  chip.addEventListener('click', () => {
    if (uiIsLocked()) {
      return
    }

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
