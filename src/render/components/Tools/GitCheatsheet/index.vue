<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.git-cheatsheet-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <article
          ref="contentRef"
          class="select-text prose prose-slate dark:prose-invert"
          v-html="result"
        ></article>
      </el-scrollbar>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, h, onMounted, onUnmounted, render, ref, markRaw } from 'vue'
  import { AppI18n, I18nT } from '@lang/index'
  import MemoEn from './lang/git-memo.en.md?raw'
  import MemoVi from './lang/git-memo.vi.md?raw'
  import markdownit from 'markdown-it'
  import { MessageSuccess } from '@/util/Element'
  import { clipboard } from '@/util/NodeFn'
  import { ElButton } from 'element-plus'
  import { CopyDocument, Check } from '@element-plus/icons-vue'
  import { createHighlighter, type Highlighter } from 'shiki'

  const i18n = AppI18n()
  const highlighter = ref<Highlighter | null>(null)

  let observer: MutationObserver | null = null
  const resetTimers = new Map<Element, ReturnType<typeof setTimeout>>()

  onMounted(async () => {
    highlighter.value = await createHighlighter({
      themes: ['github-dark'],
      langs: ['bash', 'shell']
    })

    if (contentRef.value) {
      observer = new MutationObserver(() => {
        mountButtons()
      })
      observer.observe(contentRef.value, { childList: true, subtree: true })
    }
    mountButtons()
  })

  onUnmounted(() => {
    observer?.disconnect()
    resetTimers.forEach((id) => clearTimeout(id))
    resetTimers.clear()
  })
  const md = markdownit({
    html: false,
    linkify: true,
    typographer: true
  })

  md.renderer.rules.fence = function (tokens, idx) {
    const token = tokens[idx]
    const code = token.content.trim()
    const lines = code.split('\n')

    const renderedLines = lines
      .map((line) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('#') || !trimmed) {
          return `<div class="code-line comment"><span class="line-content">${md.utils.escapeHtml(line)}</span></div>`
        }

        let highlighted = md.utils.escapeHtml(line)
        if (highlighter.value) {
          try {
            const html = highlighter.value.codeToHtml(line, {
              lang: 'bash',
              theme: 'github-dark'
            })
            // Extract the core content from shiki's pre/code wrapper
            const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
            if (match) {
              highlighted = match[1]
            }
          } catch (e) {
            console.error('Shiki highlighting failed:', e)
          }
        }

        // Return a single line string to prevent pre-tag whitespace issues
        return `<div class="code-line command"><span class="line-content">${highlighted}</span><div class="copy-btn-placeholder" data-code="${encodeURIComponent(trimmed)}"></div></div>`
      })
      .join('')

    return `<div class="code-block-wrapper"><pre><code>${renderedLines}</code></pre></div>`
  }

  const memos = {
    en: MemoEn,
    vi: MemoVi
  }

  const memo = computed(() => {
    // Ensure i18n.global.locale is reactive. For example, if it's a ref, use i18n.global.locale.value
    const locale = i18n.global.locale as keyof typeof memos
    return memos[locale] ?? MemoEn
  })

  const result = computed(() => {
    return highlighter.value ? md.render(memo.value) : ''
  })

  const contentRef = ref<HTMLElement | null>(null)

  const copy = (v: string) => {
    clipboard.writeText(v)
    MessageSuccess(md.utils.escapeHtml(I18nT('base.copySuccess')))
  }

  const mountButtons = () => {
    const el = contentRef.value
    if (!el) return
    const placeholders = el.querySelectorAll('.copy-btn-placeholder')
    placeholders.forEach((p) => {
      if (p.children.length > 0) return
      p.innerHTML = ''
      const code = decodeURIComponent(p.getAttribute('data-code') || '')
      const btnIcon = ref(markRaw(CopyDocument))

      const renderBtn = () => {
        const vnode = h(
          ElButton,
          {
            link: true,
            icon: btnIcon.value,
            onClick: () => {
              copy(code)
              btnIcon.value = markRaw(Check)
              renderBtn()
              const existing = resetTimers.get(p)
              if (existing) clearTimeout(existing)
              const timeoutId = setTimeout(() => {
                btnIcon.value = markRaw(CopyDocument)
                renderBtn()
                resetTimers.delete(p)
              }, 2000)
              resetTimers.set(p, timeoutId)
            }
          },
          () => []
        )
        render(vnode, p)
      }
      renderBtn()
    })
  }
</script>

<style lang="scss">
  .code-block-wrapper {
    position: relative;
    margin-bottom: 1.5rem;
    background: #1e293b;
    border-radius: 8px;
    overflow: hidden;

    pre {
      margin: 0 !important;
      padding: 0.5rem 1rem !important; // Reduced vertical padding
      background: transparent !important;
    }

    code {
      display: block;
      padding: 0 !important;
    }

    .code-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 1.2rem;
      padding: 0 0.5rem;
      margin: 0 !important;
      border-radius: 4px;
      line-height: 1; // Strict line height
      transition: background 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      &.comment {
        color: #64748b;
        font-style: italic;
      }

      .line-content {
        flex: 1;
        white-space: pre-wrap;
        word-break: break-all;
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
          monospace;
        font-size: 0.9rem;
        line-height: 1.4;
      }
    }

    .copy-btn-placeholder {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 1rem;
      min-width: 32px; // Ensure space even before mount
      min-height: 24px;
      opacity: 0.8;
      transition: all 0.2s ease-in-out;

      &:hover {
        opacity: 1;
      }

      .el-button {
        padding: 4px;
        height: auto;
        color: #94a3b8;

        &:hover {
          color: #409eff;
        }
      }
    }

    .code-line:hover .copy-btn-placeholder {
      opacity: 1;
    }
  }

  .dark {
    .code-block-wrapper {
      background: #0f172a;

      .code-line:hover {
        background: rgba(255, 255, 255, 0.03);
      }
    }
  }
</style>
