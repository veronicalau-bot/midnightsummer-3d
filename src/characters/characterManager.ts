import {
  AssetContainer,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
} from '@babylonjs/core'
import type { AbstractMesh } from '@babylonjs/core'
import '@babylonjs/loaders/glTF'
import { CHARACTER_BY_ID, type CharacterDefinition } from './characterRegistry'

const MIN_CHARACTER_Y = -1.8

export type CharacterInstanceState = {
  instanceId: string
  characterId: string
  position: { x: number; y: number; z: number }
  scale: number
  rotationY: number
}

type CharacterInstance = {
  instanceId: string
  character: CharacterDefinition
  root: TransformNode
  meshes: AbstractMesh[]
  scale: number
}

export class CharacterManager {
  private readonly scene: Scene
  private readonly reportStatus: (message: string) => void
  private cache = new Map<string, AssetContainer>()
  private pending = new Map<string, Promise<AssetContainer>>()
  private instances = new Map<string, CharacterInstance>()
  private serial = 0

  constructor(scene: Scene, reportStatus: (message: string) => void) {
    this.scene = scene
    this.reportStatus = reportStatus
  }

  public async spawnCharacter(characterId: string, position: Vector3): Promise<CharacterInstanceState> {
    const character = CHARACTER_BY_ID.get(characterId)
    if (!character) {
      throw new Error(`Unknown character ${characterId}.`)
    }

    const container = await this.getContainer(character)
    const instanceId = `${character.id}-${++this.serial}`
    const root = new TransformNode(`character-root-${instanceId}`, this.scene)
    const instantiated = container.instantiateModelsToScene((name) => `${name}-${instanceId}`, false)

    for (const node of instantiated.rootNodes) {
      node.parent = root
    }

    const meshes = root.getChildMeshes(false)
    for (const mesh of meshes) {
      mesh.isPickable = true
      mesh.metadata = {
        ...(mesh.metadata ?? {}),
        characterInstanceId: instanceId,
      }
    }

    const normalizedPosition = new Vector3(position.x, Math.max(position.y, MIN_CHARACTER_Y), position.z)
    root.position.copyFrom(normalizedPosition)
    root.scaling.setAll(character.defaultScale)

    const instance: CharacterInstance = {
      instanceId,
      character,
      root,
      meshes,
      scale: character.defaultScale,
    }

    this.instances.set(instanceId, instance)
    this.reportStatus(`Placed ${character.title}.`)

    return this.serializeInstance(instance)
  }

  public removeCharacter(instanceId: string): void {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      return
    }

    // Keep shared cached materials alive for future instantiation.
    instance.root.dispose(false, false)
    this.instances.delete(instanceId)
  }

  public clearCharacters(): void {
    for (const instanceId of this.instances.keys()) {
      this.removeCharacter(instanceId)
    }
  }

  public moveCharacter(instanceId: string, position: Vector3): void {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      return
    }

    instance.root.position.set(position.x, Math.max(position.y, MIN_CHARACTER_Y), position.z)
  }

  public moveCharacterByDelta(instanceId: string, delta: Vector3): void {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      return
    }

    instance.root.position.addInPlace(delta)
    if (instance.root.position.y < MIN_CHARACTER_Y) {
      instance.root.position.y = MIN_CHARACTER_Y
    }
  }

  public scaleCharacter(instanceId: string, scaleDelta: number): number | null {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      return null
    }

    const nextScale = Math.min(
      Math.max(instance.scale + scaleDelta, instance.character.minScale),
      instance.character.maxScale,
    )

    instance.scale = nextScale
    instance.root.scaling.setAll(nextScale)
    return nextScale
  }

  public rotateCharacter(instanceId: string, deltaRadians: number): number | null {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      return null
    }

    instance.root.rotation.y += deltaRadians

    const twoPi = Math.PI * 2
    while (instance.root.rotation.y >= twoPi) {
      instance.root.rotation.y -= twoPi
    }
    while (instance.root.rotation.y < 0) {
      instance.root.rotation.y += twoPi
    }

    return instance.root.rotation.y
  }

  public setSelected(instanceId: string | null): void {
    for (const instance of this.instances.values()) {
      const isActive = instance.instanceId === instanceId
      for (const mesh of instance.meshes) {
        mesh.renderOutline = isActive
        mesh.outlineColor.set(1, 0.82, 0.32)
        mesh.outlineWidth = 0.03
      }
    }
  }

  public getCharacterInstanceIdFromMesh(mesh: AbstractMesh): string | null {
    let current: AbstractMesh | null = mesh
    while (current) {
      const metadata = current.metadata as { characterInstanceId?: string } | null
      if (metadata?.characterInstanceId) {
        return metadata.characterInstanceId
      }

      const parentNode = current.parent
      if (!parentNode || parentNode.getClassName() !== 'Mesh') {
        break
      }

      current = parentNode as AbstractMesh
    }

    return null
  }

  public getSerializedState(): CharacterInstanceState[] {
    return Array.from(this.instances.values()).map((instance) => this.serializeInstance(instance))
  }

  public async restoreFromState(states: CharacterInstanceState[]): Promise<void> {
    this.clearCharacters()

    for (const state of states) {
      const restored = await this.spawnCharacter(
        state.characterId,
        new Vector3(state.position.x, state.position.y, state.position.z),
      )
      const restoredScale = state.scale - restored.scale
      if (Math.abs(restoredScale) > 0.0001) {
        this.scaleCharacter(restored.instanceId, restoredScale)
      }

      if (typeof state.rotationY === 'number' && Number.isFinite(state.rotationY)) {
        this.rotateCharacter(restored.instanceId, state.rotationY)
      }
    }
  }

  public getInstanceLabel(instanceId: string): string | null {
    const instance = this.instances.get(instanceId)
    return instance?.character.title ?? null
  }

  public getRootNode(instanceId: string): TransformNode | null {
    const instance = this.instances.get(instanceId)
    return instance?.root ?? null
  }

  private serializeInstance(instance: CharacterInstance): CharacterInstanceState {
    return {
      instanceId: instance.instanceId,
      characterId: instance.character.id,
      position: {
        x: instance.root.position.x,
        y: instance.root.position.y,
        z: instance.root.position.z,
      },
      scale: instance.scale,
      rotationY: instance.root.rotation.y,
    }
  }

  private async getContainer(character: CharacterDefinition): Promise<AssetContainer> {
    const cached = this.cache.get(character.id)
    if (cached) {
      return cached
    }

    const pending = this.pending.get(character.id)
    if (pending) {
      return pending
    }

    const loadPromise = SceneLoader.LoadAssetContainerAsync('/characters/', character.fileName, this.scene)
      .then((container) => {
        this.cache.set(character.id, container)
        this.pending.delete(character.id)
        return container
      })
      .catch((error: unknown) => {
        this.pending.delete(character.id)
        throw error
      })

    this.pending.set(character.id, loadPromise)
    return loadPromise
  }
}