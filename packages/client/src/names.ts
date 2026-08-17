export const BOX_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

export const invalidBoxName = (name: string): string | undefined => {
  if (name !== "" && BOX_NAME.test(name)) return undefined
  return `invalid box name: ${name}`
}
