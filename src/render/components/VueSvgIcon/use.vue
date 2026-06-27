<template>
  <svg class="fa-icon">
    <use :xlink:href="`#${id}`"></use>
  </svg>
</template>

<script lang="ts" setup>
  import { SVGStore } from '@/components/VueSvgIcon/store'
  import { computed, Ref, ref } from 'vue'
  import { getExtractedSVG } from 'svg-inline-loader'

  const props = defineProps<{
    svg: string | Promise<string>
    rawColor?: boolean
  }>()

  const store = SVGStore()
  const svgs = computed(() => {
    return store.svgs
  })

  const hashCode = (str: string) => {
    let hash = 2166136261
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
    }
    return hash >>> 0
  }

  const init = (svg: string) => {
    if (!svgs.value?.[id.value]) {
      let config = {
        removeTags: true,
        removingTags: ['p-id', 'id', 'class', 'title', 'desc', 'defs', 'style'],
        removingTagAttrs: [
          't',
          'version',
          'p-id',
          'id',
          'class',
          'title',
          'desc',
          'defs',
          'style',
          'xmlns',
          'xmlns:xlink'
        ]
      }
      if (props.rawColor) {
        config = {
          removeTags: true,
          removingTags: ['id', 'title', 'desc'],
          removingTagAttrs: ['version', 'id', 'title', 'desc', 'xmlns', 'xmlns:xlink']
        }
      }
      const content = getExtractedSVG(svg, config)
      const viewBoxReg = new RegExp('viewBox="(.*?) (.*?) (.*?) (.*?)"')
      const viewBox = content.match(viewBoxReg)
      const x = viewBox?.[1] ?? 0
      const y = viewBox?.[2] ?? 0
      const width = viewBox?.[3] ?? 1024
      const height = viewBox?.[4] ?? 1024
      const rawReg = new RegExp('<svg.*?>(.*?)</svg>')
      const raw = content.match(rawReg)[1]
      store.svgs[id.value] = {
        viewBox: `${x} ${y} ${width} ${height}`,
        raw
      }
    }
  }

  const id: Ref<string> = ref('')

  if (typeof props.svg === 'string') {
    id.value = 'svg-' + hashCode(props.svg) + (props.rawColor ? '-raw-color' : '')
    init(props.svg)
  } else {
    props.svg.then((res: any) => {
      id.value = 'svg-' + hashCode(res.default) + (props.rawColor ? '-raw-color' : '')
      init(res.default)
    })
  }
</script>

<style>
  .fa-icon {
    display: inline-block;
    fill: currentColor;
  }

  .fa-flip-h {
    transform: scale(-1, 1);
  }

  .fa-flip-v {
    transform: scale(1, -1);
  }

  .fa-flip-vh {
    transform: scale(-1, -1);
  }

  .fa-spin {
    animation: fa-spin 0.5s 0s infinite linear;
  }

  .fa-pulse {
    animation: fa-spin 1s infinite steps(8);
  }

  @keyframes fa-spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
