<template>
  <div class="vp-doc" :data-key="index" v-html="result"></div>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { createMarkdownRenderer, type MarkdownRenderer } from '@/util/markdown/markdown'
  import '@/util/markdown/style/vars.css'
  import '@/util/markdown/style/vp-doc.css'
  import { escapeHtml } from '@/util/markdown/shared'

  const props = defineProps<{ content: string }>()
  const index = ref(0)
  let md: MarkdownRenderer | undefined

  const result = computed(() => {
    if (!index.value) {
      return ''
    }
    const content = props.content
      .replace(/<think>/g, escapeHtml('<think>\n'))
      .replace(/<\/think>/g, escapeHtml('\n</think>\n'))
    return md!.render(content)
  })

  createMarkdownRenderer().then((res) => {
    md = res
    index.value += 1
  })
</script>
