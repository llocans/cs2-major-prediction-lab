/** JSON that keeps Uint8Arrays (Pick'Em outcomes), stored as base64, for the simulation cache. */

const toBase64 = (bytes: Uint8Array) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export const encode = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) => (v instanceof Uint8Array ? { $u8: toBase64(v) } : v))

export const decode = (text: string): unknown =>
  JSON.parse(text, (_key, v: unknown) =>
    typeof v === 'object' && v !== null && '$u8' in v && typeof v.$u8 === 'string'
      ? fromBase64(v.$u8)
      : v,
  )
