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
        <article class="select-text prose prose-slate dark:prose-invert" v-html="result"></article>
      </el-scrollbar>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, onUnmounted } from 'vue'
  import { AppI18n, I18nT } from '@lang/index'
  import MemoEn from './lang/git-memo.en.md?raw'
  import MemoVi from './lang/git-memo.vi.md?raw'
  import markdownit from 'markdown-it'

  const i18n = AppI18n()
  const md = markdownit({
    html: true,
    linkify: true,
    typographer: true
  })

  // Custom rule to wrap code blocks and add a copy button
  const defaultRender =
    md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options)
    }

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx]
    const code = token.content.trim()
    const origRendered = defaultRender(tokens, idx, options, env, self)

    return `
      <div class="code-block-wrapper">
        <button class="copy-button" data-code="${encodeURIComponent(code)}" onclick="window.gitCheatsheetCopy(this)">
          <i class="bi bi-clipboard"></i>
          <span>${I18nT('base.copy')}</span>
        </button>
        ${origRendered}
      </div>
    `
  }

  const memo = computed(() => {
    const locale = i18n.global.locale
    if (locale === 'vi') {
      return MemoVi
    }
    return MemoEn
  })

  const result = computed(() => md.render(memo.value))

  // Expose copy function to window for the onclick handler
  const gitCheatsheetCopyFn = async (btn: HTMLButtonElement) => {
    const code = decodeURIComponent(btn.getAttribute('data-code') || '')
    try {
      await navigator.clipboard.writeText(code)
      const span = btn.querySelector('span')
      const icon = btn.querySelector('i')
      if (span && icon) {
        span.innerText = I18nT('base.copySuccess')
        icon.className = 'bi bi-check2'
        btn.classList.add('copied')
        setTimeout(() => {
          span.innerText = I18nT('base.copy')
          icon.className = 'bi bi-clipboard'
          btn.classList.remove('copied')
        }, 2000)
      }
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  if (typeof window !== 'undefined') {
    ;(window as any).gitCheatsheetCopy = gitCheatsheetCopyFn
  }

  onUnmounted(() => {
    if (
      typeof window !== 'undefined' &&
      (window as any).gitCheatsheetCopy === gitCheatsheetCopyFn
    ) {
      delete (window as any).gitCheatsheetCopy
    }
  })
</script>

<style lang="scss">
  .code-block-wrapper {
    position: relative;
    margin-bottom: 1.5rem;

    &:hover {
      .copy-button {
        opacity: 1;
      }
    }

    pre {
      margin: 0 !important;
      padding-top: 2.5rem !important;
    }

    .copy-button {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.3rem 0.6rem;
      font-size: 0.75rem;
      color: #94a3b8;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(71, 85, 105, 0.5);
      border-radius: 6px;
      cursor: pointer;
      opacity: 0;
      transition: all 0.2s ease-in-out;
      backdrop-filter: blur(4px);

      i {
        font-size: 0.9rem;
      }

      &:hover {
        color: #f1f5f9;
        background: rgba(51, 65, 85, 0.9);
        border-color: #64748b;
      }

      &.copied {
        color: #10b981;
        background: rgba(16, 185, 129, 0.1);
        border-color: #10b981;
      }
    }
  }

  .dark {
    .code-block-wrapper .copy-button {
      background: rgba(15, 23, 42, 0.8);
      border-color: rgba(51, 65, 85, 0.5);

      &:hover {
        background: rgba(30, 41, 59, 1);
      }
    }
  }
</style>
