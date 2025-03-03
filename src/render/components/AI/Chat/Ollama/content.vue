<template>
  <article class="select-text prose prose-slate dark:prose-invert" v-html="result"></article>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import markdownit from 'markdown-it'
  const props = defineProps<{ content: string }>()
  const md = markdownit()
  const result = computed(() => {
    return md.render(props.content)
  })
</script>
