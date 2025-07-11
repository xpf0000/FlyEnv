<script setup lang="ts">
  import { I18nT } from '@lang/index'
  import Memo from './git-memo.content.md?raw'
  import markdownit from 'markdown-it'
  const md = markdownit()
  const result = md.render(Memo)
</script>
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
