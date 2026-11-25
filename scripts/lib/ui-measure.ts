/**
 * The measurements behind `scripts/ui-audit.ts`. `measure` runs inside the browser page
 * (Playwright serialises it), so it must stay self-contained: no imports, no outside variables.
 */

export interface Issue {
  kind:
    | 'page-scroll'
    | 'cut-off'
    | 'scroll-box'
    | 'sticks-out'
    | 'too-wide'
    | 'overlap'
    | 'contrast'
    | 'tap-target'
    | string
  detail: string
}

export interface Measured {
  /** Real problems: the audit fails. */
  failures: Issue[]
  /** Worth a look, listed in the report. */
  warnings: Issue[]
}

/** Runs in the page. Keep it self-contained: it is serialised into the browser. */
export function measure(mobile: boolean): Measured {
  const failures: Issue[] = []
  const warnings: Issue[] = []
  const describe = (el: Element): string => {
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    const tag = el.tagName.toLowerCase()
    const label =
      el.getAttribute('aria-label') ?? el.closest('[aria-label]')?.getAttribute('aria-label')
    return `<${tag}> "${text}"${label ? ` in "${label}"` : ''}`
  }
  const visible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return false
    // Also false inside a closed <details> and under opacity 0.
    return el.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true,
    })
  }
  const clippedByAncestor = (el: Element, stop: Element): boolean => {
    for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
      const overflow = getComputedStyle(p).overflowX
      if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') return true
    }
    return false
  }

  // Horizontal page scroll.
  const doc = document.documentElement
  if (doc.scrollWidth > doc.clientWidth + 1)
    failures.push({
      kind: 'page-scroll',
      detail: `page is ${doc.scrollWidth}px wide in a ${doc.clientWidth}px window`,
    })

  // Cut-off text.
  for (const el of document.querySelectorAll('body *')) {
    if (getComputedStyle(el).textOverflow !== 'ellipsis' || !visible(el)) continue
    if (el.scrollWidth > el.clientWidth + 1)
      failures.push({
        kind: 'cut-off',
        detail: `${describe(el)} needs ${el.scrollWidth}px, has ${el.clientWidth}px`,
      })
  }

  // Content hidden in a sideways scroll box. Only boxes marked `data-scrolls` (the brackets) may
  // scroll; a table that needs one should be made to fit instead.
  for (const el of document.querySelectorAll('body *')) {
    const overflow = getComputedStyle(el).overflowX
    if (overflow !== 'auto' && overflow !== 'scroll') continue
    if (!visible(el) || el.hasAttribute('data-scrolls')) continue
    if (el.scrollWidth > el.clientWidth + 1)
      failures.push({
        kind: 'scroll-box',
        detail: `${describe(el)} hides ${el.scrollWidth - el.clientWidth}px behind a sideways scroll`,
      })
  }

  // Content sticking out of the page column (only the outermost element of each overflow).
  const main = document.querySelector('main')
  if (main) {
    const column = main.getBoundingClientRect()
    for (const el of main.querySelectorAll('*')) {
      if (!visible(el) || el.closest('svg') || clippedByAncestor(el, main)) continue
      const rect = el.getBoundingClientRect()
      const out = rect.right > column.right + 1 || rect.left < column.left - 1
      if (!out) continue
      const parent = el.parentElement?.getBoundingClientRect()
      if (parent && (parent.right > column.right + 1 || parent.left < column.left - 1)) continue
      failures.push({
        kind: 'sticks-out',
        detail: `${describe(el)} ends at ${Math.round(rect.right)}px, column ends at ${Math.round(column.right)}px`,
      })
    }
  }

  // A table wider than the box it sits in: it runs under its neighbour (e.g. the Stage page's
  // Probabilities table under the team panel at 1024 px), even when it stays inside the page column.
  for (const table of document.querySelectorAll('main table')) {
    const box = table.parentElement
    if (!box || !visible(table) || table.closest('[data-scrolls]')) continue
    // A table in a scroll or clip box is the scroll-box check's job.
    if (getComputedStyle(box).overflowX !== 'visible') continue
    const width = table.getBoundingClientRect().width
    if (width > box.clientWidth + 1)
      failures.push({
        kind: 'too-wide',
        detail: `${describe(table)} is ${Math.round(width)}px wide in a ${box.clientWidth}px box`,
      })
  }

  // Text boxes: one per text node, with the element that colours it.
  interface TextBox {
    el: Element
    /** One rect per line, so wrapped text never counts as covering its whole paragraph. */
    rect: DOMRect
  }
  const boxes: TextBox[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement
    if (!el || !(node.textContent ?? '').trim() || el.closest('svg, script, style, .sr-only'))
      continue
    if (!visible(el)) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) {
      if (rect.width >= 2 && rect.height >= 2) boxes.push({ el, rect })
    }
  }

  // Text drawn over other text.
  const overlaps = new Set<string>()
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]
    if (!a) continue
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]
      if (!b || a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue
      const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
      const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
      // Lines of text may touch; real overlap covers a few pixels each way.
      if (w > 3 && h > 4) {
        const key = `${describe(a.el)} / ${describe(b.el)}`
        if (!overlaps.has(key)) {
          overlaps.add(key)
          failures.push({ kind: 'overlap', detail: key })
        }
      }
    }
  }

  // Contrast (WCAG AA), grouped by colour pair.
  const rgb = (value: string): [number, number, number, number] | undefined => {
    const m = value.match(/rgba?\(([^)]+)\)/)
    if (!m?.[1]) return undefined
    const [r = 0, g = 0, b = 0, a = 1] = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number)
    return [r, g, b, a]
  }
  const background = (el: Element): [number, number, number] => {
    for (let p: Element | null = el; p; p = p.parentElement) {
      const c = rgb(getComputedStyle(p).backgroundColor)
      if (c && c[3] > 0.5) return [c[0], c[1], c[2]]
    }
    const body = rgb(getComputedStyle(document.body).backgroundColor)
    return body ? [body[0], body[1], body[2]] : [255, 255, 255]
  }
  const luminance = ([r, g, b]: [number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const hex = (c: [number, number, number]) =>
    `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
  const lowContrast = new Map<string, { ratio: number; count: number; example: string }>()
  for (const { el } of boxes) {
    const style = getComputedStyle(el)
    const fg = rgb(style.color)
    if (!fg) continue
    const bg = background(el)
    const alpha = fg[3]
    const color: [number, number, number] = [
      fg[0] * alpha + bg[0] * (1 - alpha),
      fg[1] * alpha + bg[1] * (1 - alpha),
      fg[2] * alpha + bg[2] * (1 - alpha),
    ]
    const [hi, lo] = [luminance(color), luminance(bg)].sort((x, y) => y - x) as [number, number]
    const ratio = (hi + 0.05) / (lo + 0.05)
    const size = Number.parseFloat(style.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
    if (ratio >= (large ? 3 : 4.5)) continue
    const key = `${hex(color)} on ${hex(bg)}`
    const entry = lowContrast.get(key)
    if (entry) entry.count++
    else lowContrast.set(key, { ratio, count: 1, example: describe(el) })
  }
  for (const [key, { ratio, count, example }] of lowContrast)
    failures.push({
      kind: 'contrast',
      detail: `${key} is ${ratio.toFixed(2)}:1 (${count} texts, e.g. ${example})`,
    })

  // Mobile tap targets (warning): under 24 px and closer than 24 px to another target.
  if (mobile) {
    const targets = [
      ...document.querySelectorAll('a[href], button, summary, input, select, [role="button"]'),
    ].filter((el) => visible(el) && !(el.tagName === 'A' && el.closest('p')))
    const rects = targets.map((el) => el.getBoundingClientRect())
    let crowded = 0
    let example = ''
    targets.forEach((el, i) => {
      const r = rects[i]
      if (!r || (r.width >= 24 && r.height >= 24)) return
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const near = rects.some((o, j) => {
        if (j === i || !o) return false
        const dx = Math.max(o.left - cx, 0, cx - o.right)
        const dy = Math.max(o.top - cy, 0, cy - o.bottom)
        return Math.hypot(dx, dy) < 12
      })
      if (near) {
        crowded++
        example ||= `${describe(el)} is ${Math.round(r.width)}x${Math.round(r.height)}px`
      }
    })
    if (crowded > 0)
      warnings.push({
        kind: 'tap-target',
        detail: `${crowded} targets under 24px with a neighbour closer than 12px, e.g. ${example}`,
      })
  }

  return { failures, warnings }
}
