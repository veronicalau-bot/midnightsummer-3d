export type CharacterDefinition = {
  id: string
  title: string
  fileName: string
  defaultScale: number
  minScale: number
  maxScale: number
}

const createCharacter = (index: number): CharacterDefinition => ({
  id: `character-${index}`,
  title: `Character ${index}`,
  fileName: `Character_${index}.glb`,
  defaultScale: 0.72,
  minScale: 0.35,
  maxScale: 2.8,
})

export const CHARACTERS: CharacterDefinition[] = Array.from({ length: 12 }, (_, index) =>
  createCharacter(index + 1),
)

export const CHARACTER_BY_ID = new Map(CHARACTERS.map((character) => [character.id, character]))