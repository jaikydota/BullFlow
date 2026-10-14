/**
 * 跨域强制下载：fetch 远程 URL → Blob → 创建临时 <a download> click。
 *
 * 为什么不用 `<a href={url} download>` 直接放在 JSX 里？
 *   HTML5 `download` 属性**只对同源资源生效**——浏览器对跨域 URL 会忽略 download，
 *   退化成普通跳转（在新页打开预览）。我们的 MinIO / 第三方 OSS URL 跨域，必须
 *   通过 JS fetch 读 Blob 再触发下载才能保证"下载"语义。
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  const blob = await resp.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename || guessFileName(url) || 'download'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objUrl)
}

/** 从 URL path 末段猜文件名；带 query 也只取问号前部分。 */
function guessFileName(url: string): string {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').pop() || ''
    return last.split('?')[0]
  } catch {
    // 不是合法 URL → 直接 split
    return url.split('/').pop()?.split('?')[0] || ''
  }
}
