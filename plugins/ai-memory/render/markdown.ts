import MarkdownIt from 'markdown-it'
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false })
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content)
markdown.renderer.rules.link_open = () => '<span>'
markdown.renderer.rules.link_close = () => '</span>'
export const renderMemoryMarkdown = (content: string) => markdown.render(content)
