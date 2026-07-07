export type SceneDefinition = {
  id: string
  title: string
  fileName: string
  startView?: {
    alpha: number
    beta: number
    zoom?: number
  }
}

export const SCENES: SceneDefinition[] = [
  {
    id: 'summer-1',
    title: 'Summer Scene I',
    fileName: 'Summer1.glb',
    // Start facing the big tree + bench + characters composition requested by user.
    startView: {
      alpha: 1.03,
      beta: 1.33,
      zoom: 1.6,
    },
  },
  {
    id: 'summer-2',
    title: 'Summer Scene II',
    fileName: 'Summer2.glb',
    // Turn right ~80 degrees from default and widen FOV.
    startView: {
      alpha: 0.175,
      beta: 1.309,
      zoom: 1.6,
    },
  },
  {
    id: 'summer-3',
    title: 'Summer Scene III',
    fileName: 'Summer3.glb',
    // Turn right ~80 degrees from default and widen FOV.
    startView: {
      alpha: 0.175,
      beta: 1.309,
      zoom: 1.6,
    },
  },
  {
    id: 'summer-4',
    title: 'Summer Scene IV',
    fileName: 'Summer4.glb',
    // Start on the tree + bench + right actor composition requested by user.
    startView: {
      alpha: 0.508,
      beta: 1.33,
      zoom: 1.6,
    },
  },
]