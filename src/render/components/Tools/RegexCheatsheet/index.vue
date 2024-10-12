<script setup lang="ts">
  import { I18nT } from '@shared/lang'
  import Memo from './regex-memo.content.md?raw'
  import markdownit from 'markdown-it'

  const { shell } = require('@electron/remote')
  const md = markdownit()
  const result = md.render(Memo)

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log(e.target)
    const dom: HTMLElement = e.target as any
    if (dom.tagName.toUpperCase() === 'A') {
      const url = dom.getAttribute('href')
      shell.openExternal(url)
    }
  }
</script>
<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('regex-cheatsheet.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <article
          ref="content"
          class="select-text prose prose-slate dark:prose-invert"
          @click.stop="onClick"
          v-html="result"
        ></article>
      </el-scrollbar>
    </div>
  </div>
</template>
