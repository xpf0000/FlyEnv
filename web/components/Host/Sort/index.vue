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
        <div class="top">
          <span>置顶</span>
          <el-switch v-model="isTop" :disabled="!editHost"></el-switch>
        </div>
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
  import { computed, nextTick, type Ref, ref } from 'vue'
  import { type AppHost } from '@web/store/app'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { ClickOutside as vClickOutside } from 'element-plus'
  import { HostStore } from '@web/components/Host/store'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    hostId: number
    rect: DOMRect
  }>()

  const style = {
    position: 'fixed',
    left: `${props.rect.left}px`,
    top: `${props.rect.top}px`,
    width: `${props.rect.width}px`,
    height: `${props.rect.height}px`,
    opacity: 0
  }

  let filterHosts: Ref<AppHost[]> = ref([])
  let hostBack = ''

  let editHost: Ref<AppHost | undefined> = ref()

  show.value = true

  let isShow = false

  const onShow = () => {
    isShow = true
    filterHosts.value = HostStore.tabList(HostStore.tab)
    hostBack = JSON.stringify(filterHosts.value)
    editHost.value = filterHosts.value.find((h) => h?.id === props?.hostId)
    console.log('onShow: ', filterHosts.value, HostStore.tab)
  }

  const onHide = () => {
    delete editHost.value?.isSorting
    closedFn && closedFn()
    const host = JSON.stringify(filterHosts.value)
    if (hostBack !== host) {
      console.log('has changed !!!')
      HostStore.save()
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
        `[data-host-id="${props.hostId}"]`
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

  const isTop = computed({
    get() {
      return editHost?.value?.isTop ?? false
    },
    set(v: boolean) {
      if (!editHost?.value) {
        return
      }
      editHost.value!.isSorting = true
      const host: any = editHost.value
      host.isTop = v
      if (v) {
        const index = filterHosts.value.findIndex((h) => h === host)
        if (index >= 0) {
          filterHosts.value.splice(index, 1)
          filterHosts.value.unshift(host)
        }
      } else {
        const index = filterHosts.value.findIndex((h) => h === host)
        if (index >= 0) {
          filterHosts.value.splice(index, 1)
          const list = filterHosts.value.filter((h) => !!h?.isTop)
          filterHosts.value.splice(list.length, 0, host)
        }
      }
      flowScroll()
    }
  })

  const max = computed(() => {
    if (isTop.value) {
      const list = filterHosts.value.filter((h) => !!h?.isTop)
      return Math.max(0, list.length - 1)
    }
    const list = filterHosts.value.filter((h) => !h?.isTop)
    console.log('max list.length: ', list.length)
    return Math.max(0, list.length - 1)
  })

  const value = computed({
    get() {
      if (!editHost?.value) {
        return 0
      }
      let list = filterHosts.value.filter((h) => !h?.isTop)
      if (isTop.value) {
        list = filterHosts.value.filter((h) => !!h?.isTop)
      }
      return list.length - 1 - list.findIndex((h) => h.id === editHost?.value?.id)
    },
    set(v: number) {
      if (!editHost?.value) {
        return
      }
      editHost.value!.isSorting = true
      const host: any = editHost.value
      let index = v
      if (isTop.value) {
        const list = filterHosts.value.filter((h) => !!h?.isTop)
        index = list.length - 1 - v
      } else {
        const list = filterHosts.value.filter((h) => !h?.isTop)
        index = list.length - 1 - v
      }
      const list = filterHosts.value.filter((h) => !!h?.isTop)
      const rawIndex = filterHosts.value.findIndex((h) => h === host)
      if (rawIndex >= 0) {
        filterHosts.value.splice(rawIndex, 1)
        if (!isTop.value) {
          index += list.length
        }
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
