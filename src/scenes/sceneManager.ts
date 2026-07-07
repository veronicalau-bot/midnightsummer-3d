import {
  ArcRotateCamera,
  AssetContainer,
  Scene,
  SceneLoader,
  Vector3,
} from '@babylonjs/core'
import type { AbstractMesh } from '@babylonjs/core'
import '@babylonjs/loaders/glTF'
import { SCENES, type SceneDefinition } from './sceneRegistry'

type FramingData = {
  center: Vector3
  insideRadius: number
  alpha: number
  beta: number
  fov: number
}

const INSIDE_RADIUS_FACTOR = 0.018
const MIN_INSIDE_RADIUS = 0.08
const MAX_INSIDE_RADIUS = 0.35
const BASE_FOV = 0.8
const MAX_FOV = 2.0

export class SceneManager {
  private readonly scene: Scene
  private readonly camera: ArcRotateCamera
  private readonly reportStatus: (message: string) => void
  private activeContainer: AssetContainer | null = null
  private activeSceneId: string | null = null
  private cache = new Map<string, AssetContainer>()
  private pending = new Map<string, Promise<AssetContainer>>()
  private framingData: FramingData | null = null

  constructor(scene: Scene, camera: ArcRotateCamera, reportStatus: (message: string) => void) {
    this.scene = scene
    this.camera = camera
    this.reportStatus = reportStatus
  }

  public async loadSceneByIndex(index: number): Promise<SceneDefinition> {
    const definition = SCENES[index]
    if (!definition) {
      throw new Error(`Invalid scene index ${index}.`)
    }

    this.reportStatus(`Loading ${definition.title}...`)
    const container = await this.getContainer(definition)

    if (this.activeContainer) {
      this.activeContainer.removeAllFromScene()
    }

    container.addAllToScene()
    this.activeContainer = container
    this.activeSceneId = definition.id

    this.framingData = this.computeFraming(container.meshes, definition)
    this.frameCamera(this.framingData)

    this.trimCache(index)
    this.preloadAdjacent(index)

    return definition
  }

  public resetView(): void {
    if (!this.framingData) {
      return
    }
    this.frameCamera(this.framingData)
  }

  private async getContainer(definition: SceneDefinition): Promise<AssetContainer> {
    const cached = this.cache.get(definition.id)
    if (cached) {
      return cached
    }

    const pending = this.pending.get(definition.id)
    if (pending) {
      return pending
    }

    const loadingPromise = SceneLoader.LoadAssetContainerAsync(
      '/scenes/',
      definition.fileName,
      this.scene,
    )
      .then((container) => {
        this.cache.set(definition.id, container)
        this.pending.delete(definition.id)
        return container
      })
      .catch((error: unknown) => {
        this.pending.delete(definition.id)
        throw error
      })

    this.pending.set(definition.id, loadingPromise)
    return loadingPromise
  }

  private preloadAdjacent(index: number): void {
    const adjacentIndexes = [index - 1, index + 1]

    for (const adjacentIndex of adjacentIndexes) {
      const next = SCENES[adjacentIndex]
      if (!next || this.cache.has(next.id) || this.pending.has(next.id)) {
        continue
      }
      void this.getContainer(next)
    }
  }

  private trimCache(index: number): void {
    const keepIds = new Set<string>()
    const prev = SCENES[index - 1]
    const current = SCENES[index]
    const next = SCENES[index + 1]

    if (prev) {
      keepIds.add(prev.id)
    }
    if (current) {
      keepIds.add(current.id)
    }
    if (next) {
      keepIds.add(next.id)
    }

    if (this.activeSceneId) {
      keepIds.add(this.activeSceneId)
    }

    for (const [sceneId, container] of this.cache.entries()) {
      if (keepIds.has(sceneId)) {
        continue
      }
      container.dispose()
      this.cache.delete(sceneId)
    }
  }

  private computeFraming(meshes: AbstractMesh[], definition: SceneDefinition): FramingData {
    let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
    let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
    let hasBounds = false

    for (const mesh of meshes) {
      if (mesh.getTotalVertices() === 0) {
        continue
      }

      const bounding = mesh.getBoundingInfo().boundingBox
      min = Vector3.Minimize(min, bounding.minimumWorld)
      max = Vector3.Maximize(max, bounding.maximumWorld)
      hasBounds = true
    }

    if (!hasBounds) {
      return {
        center: new Vector3(0, 1.4, 0),
        insideRadius: 0.2,
        alpha: definition.startView?.alpha ?? Math.PI / 2,
        beta: definition.startView?.beta ?? Math.PI / 2.4,
        fov: Math.min(BASE_FOV * (definition.startView?.zoom ?? 1), MAX_FOV),
      }
    }

    const center = min.add(max).scale(0.5)
    const diagonalLength = Vector3.Distance(min, max)

    const baseInsideRadius = Math.min(
      Math.max(diagonalLength * INSIDE_RADIUS_FACTOR, MIN_INSIDE_RADIUS),
      MAX_INSIDE_RADIUS,
    )
    const zoomFactor = definition.startView?.zoom ?? 1

    return {
      center,
      insideRadius: baseInsideRadius,
      alpha: definition.startView?.alpha ?? Math.PI / 2,
      beta: definition.startView?.beta ?? Math.PI / 2.4,
      fov: Math.min(BASE_FOV * zoomFactor, MAX_FOV),
    }
  }

  private frameCamera(framing: FramingData): void {
    this.camera.target.copyFrom(framing.center)
    this.camera.radius = framing.insideRadius
    this.camera.alpha = framing.alpha
    this.camera.beta = framing.beta
    this.camera.fov = framing.fov
  }
}