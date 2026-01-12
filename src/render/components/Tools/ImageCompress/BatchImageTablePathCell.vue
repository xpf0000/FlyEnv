<template>
  <div ref="dom" class="w-full">
    <span>{{ content }}</span>
  </div>
</template>
<script lang="ts" setup>
  import { computed, ref, onMounted, nextTick, onBeforeUnmount, watch } from 'vue'
  import { ImageBatch } from '@/components/Tools/ImageCompress/setup'
  const dom = ref<HTMLElement>()
  const props = defineProps<{
    content: string
  }>()
  const index = ref(0)

  watch(
    () => props.content,
    (newVal) => {
      if (newVal) {
        ImageBatch.getWordWidths(newVal)
      }
    }
  )

  /**
   * 根据宽度 计算显示的文字 中间用...代替
   */
  const content = computed(() => {
    if (index.value >= 0 && dom.value) {
      const words = props.content.split('')
      let wordWidth = 0
      for (const word of words) {
        wordWidth += ImageBatch.wordWidths[word]
      }
      const rect = dom.value.getBoundingClientRect()
      const maxWidth = rect.width
      if (wordWidth <= maxWidth) {
        return props.content
      }
      let width = 0
      const arrCenter = ['.', '.', '.']
      const arrLeft = []
      const arrRight = []
      width = ImageBatch.wordWidths['.'] * 3
      while (width < maxWidth) {
        const left = words.shift()
        const right = words.pop()
        if (left === undefined && right === undefined) {
          break
        }
        if (left !== undefined) {
          const leftWidth = ImageBatch.wordWidths[left]
          if (width + leftWidth <= maxWidth) {
            arrLeft.push(left)
          } else {
            break
          }
        }
        if (right !== undefined) {
          const rightWidth = ImageBatch.wordWidths[right]
          if (width + rightWidth <= maxWidth) {
            arrRight.unshift(right)
          } else {
            break
          }
        }
      }
      return [...arrLeft, ...arrCenter, ...arrRight].join('')
    }
    return ''
  })

  let obsever: ResizeObserver | undefined | null

  onMounted(() => {
    nextTick(() => {
      obsever = new ResizeObserver(() => {
        index.value += 1
      })
      obsever.observe(dom.value!)
    })
  })

  onBeforeUnmount(() => {
    obsever?.disconnect()
    obsever = null
  })
</script>
