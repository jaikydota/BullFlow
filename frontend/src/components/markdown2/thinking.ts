/**
 * Pure-HTML generator for <think>…</think> blocks.
 *
 * We intentionally avoid React + createRoot here because:
 *   1. markdown-it rules must return plain HTML strings synchronously
 *   2. React event handlers don't survive innerHTML injection
 *
 * Toggle is handled via event-delegation in index.tsx (data-action="toggle-think").
 */

const BRAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="m17.967 17.484A4 4 0 0 1 18 18"/></svg>`

const CHEVRON_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`

const CHEVRON_UP = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>`

const SPIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="md2-think-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`

export function renderThinkBlock(content: string, showThink: boolean, loading?: boolean): string {
  const statusLabel = loading ? '思考中' : showThink ? '收起' : '展开'
  const arrow = loading ? SPIN_SVG : showThink ? CHEVRON_UP : CHEVRON_DOWN

  return `<div class="md2-think">
  <button type="button" class="md2-think-header" data-action="toggle-think">
    <span class="md2-think-icon">${BRAIN_SVG}</span>
    <span class="md2-think-label">思考过程</span>
    <span class="md2-think-status">${statusLabel}${arrow}</span>
  </button>
  <div class="md2-think-body${showThink ? ' md2-think-open' : ''}">${content}</div>
</div>`
}

/** Ensure </think> is preceded by a blank line so markdown-it parses it as html_block */
export function processThinkingContent(content: string): string {
  if (!content.includes('\n\n</think>')) {
    const idx = content.indexOf('\n</think>')
    if (idx !== -1) {
      return content.slice(0, idx) + '\n\n</think>' + content.slice(idx + 9)
    }
  }
  return content
}
