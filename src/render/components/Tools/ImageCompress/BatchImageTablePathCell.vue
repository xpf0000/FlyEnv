<template>
  <el-tooltip :content="content">
    <div ref="dom" class="text-nowrap hover:text-yellow-500" @click.stop="openFile">
      <span class="text-nowrap">{{ contentShow }}</span>
    </div>
  </el-tooltip>
</template>
<script lang="ts" setup>
  import { computed, ref, onMounted, nextTick, onBeforeUnmount, watch } from 'vue'
  import { ImageBatch } from '@/components/Tools/ImageCompress/setup'
  import { shell } from '@/util/NodeFn'

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
    },
    {
      immediate: true
    }
  )

  const openFile = () => {
    shell.showItemInFolder(props.content).catch()
  }

  /**
   * 根据宽度 计算显示的文字 中间用...代替
   */
  const contentShow = computed(() => {
    if (index.value >= 0 && dom.value) {
      const words = props.content.split('')
      let wordWidth = 0
      for (const word of words) {
        wordWidth += ImageBatch.wordWidths[word]
      }
      const rect = dom.value.getBoundingClientRect()
      console.log('rect: ', dom.value, rect, wordWidth)
      const maxWidth = rect.width
      if (wordWidth <= maxWidth) {
        return props.content
      }
      let width = 0
      const arrCenter = ['.', '.', '.', '.', '.', '.']
      const arrLeft = []
      const arrRight = []
      width = ImageBatch.wordWidths['.'] * 6
      while (width < maxWidth) {
        const left = words.shift()
        const right = words.pop()
        if (left === undefined && right === undefined) {
          break
        }
        if (left !== undefined) {
          const leftWidth = ImageBatch.wordWidths[left]
          if (width + leftWidth <= maxWidth) {
            width += leftWidth
            arrLeft.push(left)
          } else {
            break
          }
        }
        if (right !== undefined) {
          const rightWidth = ImageBatch.wordWidths[right]
          if (width + rightWidth <= maxWidth) {
            width += rightWidth
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
