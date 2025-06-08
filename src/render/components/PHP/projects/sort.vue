<template>
  <el-popover
    placement="left"
    width="auto"
    trigger="hover"
    popper-class="host-sort-poper"
    :show-arrow="false"
    :visible="show"
    @show="onShow"
    @hide="onHide"
  >
    <template #reference>
      <div :style="style"></div>
    </template>
    <template #default>
      <div v-poper-fix v-click-outside="onClickOut" class="host-sort">
        <div class="top"> </div>
        <template v-if="disabled">
          <el-slider :show-tooltip="false" :max="1" :disabled="true" vertical height="200px" />
        </template>
        <template v-else>
          <el-slider
            v-model="value"
            :debounce="350"
            :show-tooltip="false"
            :max="max"
            :disabled="!editHost"
            vertical
            height="200px"
          />
        </template>
      </div>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { computed, nextTick, type Ref, ref, watch } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { ClickOutside as vClickOutside } from 'element-plus'
  import { type ProjectItem, ProjectSetup } from './setup'
  import type { AllAppModule } from '@/core/type'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    id: string
    rect: DOMRect
    typeFlag: AllAppModule
  }>()

  const project = ProjectSetup(props.typeFlag)

  const style = {
    position: 'fixed',
    left: `${props.rect.left}px`,
    top: `${props.rect.top}px`,
    width: `${props.rect.width}px`,
    height: `${props.rect.height}px`,
    opacity: 0
  }

  const filterHosts: Ref<ProjectItem[]> = ref([])
  let hostBack = ''

  const editHost: Ref<ProjectItem | undefined> = ref()

  show.value = true

  let isShow = false

  watch(
    () => props.id,
    () => {
      filterHosts.value = project.project
      hostBack = JSON.stringify(filterHosts.value)
      editHost.value = filterHosts.value.find((h) => h?.id === props?.id)
    },
    {
      immediate: true
    }
  )

  const onShow = () => {
    isShow = true
  }

  const onHide = () => {
    delete editHost.value?.isSorting
    closedFn?.()
    const host = JSON.stringify(filterHosts.value)
    if (hostBack !== host) {
      console.log('has changed !!!')
      project.saveProject()
    }
  }

  const onClickOut = () => {
    console.log('onClickOut !!!', show.value, isShow)
    if (isShow) {
      show.value = false
    }
  }

  const flowScroll = () => {
    nextTick().then(() => {
      let dom: HTMLElement | null | undefined = document.querySelector(
        `[data-node-project-id="${props.id}"]`
      ) as any
      if (dom) {
        dom = dom?.parentElement?.parentElement?.parentElement
        dom?.scrollIntoView({
          block: 'center',
          behavior: 'smooth'
        })
      }
    })
  }

  const max = computed(() => {
    const list = filterHosts.value
    console.log('max list.length: ', list.length)
    return Math.max(0, list.length - 1)
  })

  const value = computed({
    get() {
      if (!editHost?.value) {
        return 0
      }
      const list = filterHosts.value
      return list.length - 1 - list.findIndex((h) => h.id === editHost?.value?.id)
    },
    set(v: number) {
      if (!editHost?.value) {
        return
      }
      editHost.value!.isSorting = true
      const host: any = editHost.value
      let index = v
      const list = filterHosts.value
      index = list.length - 1 - v
      const rawIndex = filterHosts.value.findIndex((h) => h === host)
      if (rawIndex >= 0) {
        filterHosts.value.splice(rawIndex, 1)
        filterHosts.value.splice(index, 0, host)
      }
      flowScroll()
    }
  })

  const disabled = computed(() => {
    console.log('disabled: ', editHost?.value, max.value, value?.value)
    return !editHost?.value || max.value === 0 || max.value < value?.value
  })

  defineExpose({
    show,
    onSubmit,
    onClosed,
    closedFn
  })
</script>
