const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: 'dark' as const,
  securityLevel: 'loose' as const,
  fontFamily: 'inherit',
  suppressErrorRendering: true,
}

/**
 * Returns a mermaid renderer function.
 * Rendering is async (async SVG fill), but returns a placeholder synchronously so
 * markdown-it keeps its sync contract. Cached SVGs are filled in immediately on
 * subsequent renders (e.g. during streaming) to avoid flicker.
 */
export function createMermaidRenderer(
  successCache: React.MutableRefObject<Map<number, string>>,
) {
  return (code: string, count: number): string => {
    const cached = successCache.current.get(count) ?? ''
    const cls = `md2-mermaid-${count}`

    setTimeout(() => {
      import('mermaid')
        .then(({ default: mermaid }) => {
          mermaid.initialize(MERMAID_CONFIG)
          const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          return mermaid.render(id, code.trim()).then(({ svg }) => {
            successCache.current.set(count, svg)
            const el = document.querySelector(`.${cls}`)
            if (el) el.innerHTML = svg
          })
        })
        .catch(() => {/* ignore parse/render errors */})
    })

    return `<div class="md2-mermaid-wrap"><div class="${cls} md2-mermaid">${cached}</div></div>`
  }
}
