/**
 * Incremental DOM renderer for streaming Markdown output.
 *
 * Strategy:
 *   - If newHtml is just an extension of current innerHTML → append only the new nodes
 *   - Otherwise → full innerHTML replace (e.g. think-block toggle, mid-stream edit)
 */
export function incrementalRender(container: HTMLElement, newHtml: string): void {
  const oldHtml = container.innerHTML

  if (
    newHtml.length > oldHtml.length &&
    newHtml.startsWith(oldHtml)
  ) {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = newHtml.slice(oldHtml.length)
    while (tempDiv.firstChild) {
      container.appendChild(tempDiv.firstChild)
    }
    return
  }

  container.innerHTML = newHtml
}
