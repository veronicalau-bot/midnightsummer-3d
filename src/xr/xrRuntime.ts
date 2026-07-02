import type { AbstractMesh } from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'

export type XrRuntime = {
  supported: boolean
  reason: string
  inSession: boolean
  enterXR: () => Promise<void>
  exitXR: () => Promise<void>
  resetReferenceSpace: () => void
}

type CreateXrRuntimeOptions = {
  scene: Scene
  floorMeshes: AbstractMesh[]
  reportStatus: (message: string) => void
  onSessionStateChange: (inSession: boolean) => void
}

const SNAP_TURN_RADIANS = Math.PI / 6
const SNAP_STICK_DEAD_ZONE = 0.72
const SNAP_COOLDOWN_MS = 280

export async function createXrRuntime(options: CreateXrRuntimeOptions): Promise<XrRuntime> {
  const xrApi = navigator.xr
  if (!xrApi) {
    return {
      supported: false,
      reason: 'This browser does not expose WebXR.',
      inSession: false,
      enterXR: async () => Promise.resolve(),
      exitXR: async () => Promise.resolve(),
      resetReferenceSpace: () => undefined,
    }
  }

  const immersiveSupported = await xrApi.isSessionSupported('immersive-vr')
  if (!immersiveSupported) {
    return {
      supported: false,
      reason: 'Immersive VR session is not supported on this device/browser.',
      inSession: false,
      enterXR: async () => Promise.resolve(),
      exitXR: async () => Promise.resolve(),
      resetReferenceSpace: () => undefined,
    }
  }

  const xr = await options.scene.createDefaultXRExperienceAsync({
    floorMeshes: options.floorMeshes,
    uiOptions: {
      sessionMode: 'immersive-vr',
      referenceSpaceType: 'local-floor',
    },
  })

  let inSession = false
  let lastSnapTurnAt = 0

  options.scene.onBeforeRenderObservable.add(() => {
    if (!inSession) {
      return
    }

    const now = performance.now()
    for (const controller of xr.input.controllers) {
      if (controller.inputSource.handedness !== 'right') {
        continue
      }

      const gamepad = controller.motionController?.gamepadObject
      if (!gamepad || gamepad.axes.length === 0) {
        continue
      }

      const strafeAxis = gamepad.axes[2] ?? gamepad.axes[0] ?? 0
      if (Math.abs(strafeAxis) < SNAP_STICK_DEAD_ZONE) {
        continue
      }

      if (now - lastSnapTurnAt < SNAP_COOLDOWN_MS) {
        continue
      }

      xr.baseExperience.camera.cameraRotation.y += Math.sign(strafeAxis) * SNAP_TURN_RADIANS
      lastSnapTurnAt = now
    }
  })

  xr.baseExperience.sessionManager.onXRSessionInit.add(() => {
    inSession = true
    options.reportStatus('Immersive session active.')
    options.onSessionStateChange(true)
  })

  xr.baseExperience.sessionManager.onXRSessionEnded.add(() => {
    inSession = false
    options.reportStatus('Exited immersive session.')
    options.onSessionStateChange(false)
  })

  return {
    supported: true,
    reason: 'WebXR immersive-vr available.',
    get inSession() {
      return inSession
    },
    enterXR: async () => {
      if (inSession) {
        return
      }
      await xr.baseExperience.enterXRAsync('immersive-vr', 'local-floor')
    },
    exitXR: async () => {
      if (!inSession) {
        return
      }
      await xr.baseExperience.exitXRAsync()
    },
    resetReferenceSpace: () => {
      xr.baseExperience.sessionManager.resetReferenceSpace()
    },
  }
}