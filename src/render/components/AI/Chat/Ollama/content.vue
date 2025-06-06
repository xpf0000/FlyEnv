<template>
  <div class="vp-doc" v-html="result"></div>
</template>
<script lang="ts" setup>
  import { watch, nextTick } from 'vue'
  import { asyncComputed } from '@vueuse/core'
  import '@/util/markdown/style/vars.css'
  import '@/util/markdown/style/vp-doc.css'
  import { escapeHtml } from '@/util/markdown/shared'
  import { md } from '@/util/NodeFn'

  const props = defineProps<{ content: string; role: string }>()

  const emits = defineEmits(['onRender'])

  const result = asyncComputed(async () => {
    const content = props.content
      .replace(/<think>/g, escapeHtml('<think>\n'))
      .replace(/<\/think>/g, escapeHtml('\n</think>\n'))
    return await md.render(content)
  })

  watch(result, () => {
    emits('onRender', props.role, 'before')
    nextTick(() => {
      emits('onRender', props.role, 'after')
    })
  })
</script>
