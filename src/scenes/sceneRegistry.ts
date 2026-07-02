export type SceneDefinition = {
  id: string
  title: string
  fileName: string
  startView?: {
    alpha: number
    beta: number
  }
}

export const SCENES: SceneDefinition[] = [
  { id: 'summer-1', title: 'Summer Scene I', fileName: 'Summer1.glb' },
  { id: 'summer-2', title: 'Summer Scene II', fileName: 'Summer2.glb' },
  { id: 'summer-3', title: 'Summer Scene III', fileName: 'Summer3.glb' },
  {
    id: 'summer-4',
    title: 'Summer Scene IV',
    fileName: 'Summer4.glb',
    // Start on the tree + bench + right actor composition requested by user.
    startView: {
      alpha: 2.34,
      beta: 1.33,
    },
  },
]