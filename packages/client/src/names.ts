export const BOX_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

const BOX_NAME_HINT =
  'Use a letter or digit first, then letters, digits, ".", "_" or "-". Example: app-pr-42'

export const invalidBoxName = (name: string): string | undefined => {
  if (name !== "" && BOX_NAME.test(name)) return undefined
  if (name === "") return `Box name is empty. ${BOX_NAME_HINT}`
  return `"${name}" is not a valid box name. ${BOX_NAME_HINT}`
}
