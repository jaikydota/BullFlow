/**
 * 把用户输入的 Markdown 正文渲染为 HTML 字符串，用于发布到「支持 HTML 正文」的平台
 * （知乎 / 微博文章 / 百家号等，spec.content.note 含 'HTML'）。
 *
 * 复用全站已装的 markdown-it（与 react-markdown 预览同源语义），不引新依赖。
 * html:false —— 不放行用户原文里的裸 HTML 标签（转义），避免 XSS / 破坏平台编辑器。
 */
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true, // 单换行转 <br>，贴合社媒短段落书写习惯
})

export function markdownToHtml(text: string): string {
  if (!text || !text.trim()) return ''
  return md.render(text)
}
