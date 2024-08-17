<template>
  <el-popover
    placement="left"
    width="auto"
    trigger="hover"
    popper-class="host-sort-poper"
    :show-arrow="false"
    @show="onShow"
    @hide="onHide"
  >
    <template #default>
      <div v-poper-fix class="host-sort">
        <div class="top">
          <span>置顶</span>
          <el-switch v-model="isTop" :disabled="!editHost"></el-switch>
        </div>
        <el-slider
          v-model="value"
          :max="max"
          :disabled="isTop || !editHost"
          vertical
          height="200px"
        />
      </div>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { computed, type Ref, ref } from 'vue'
  import { type AppHost, AppStore } from '@/store/app'

  const props = defineProps<{
    hostId: number
  }>()

  const appStore = AppStore()

  let editHost: Ref<AppHost | undefined> = ref()

  const onShow = () => {
    console.log('onShow !!!', props.hostId)
    editHost.value = appStore.hosts.find((h) => h?.id === props?.hostId)
  }

  const onHide = () => {
    editHost.value = undefined
  }

  const isTop = computed({
    get() {
      return editHost?.value?.isTop ?? false
    },
    set(v: boolean) {
      if (!editHost?.value) {
        return
      }
      const host: any = editHost.value
      host.isTop = v
      if (v) {
        const index = appStore.hosts.findIndex((h) => h === host)
        if (index >= 0) {
          appStore.hosts.splice(index, 1)
          appStore.hosts.unshift(host)
        }
      } else {
        const index = appStore.hosts.findIndex((h) => h === host)
        if (index >= 0) {
          appStore.hosts.splice(index, 1)
          const list = appStore.hosts.filter((h) => !!h?.isTop)
          appStore.hosts.splice(list.length, 0, host)
        }
      }
    }
  })

  const max = computed(() => {
    if (isTop.value) {
      const list = appStore.hosts.filter((h) => !!h?.isTop)
      return Math.max(0, list.length - 1)
    }
    const list = appStore.hosts.filter((h) => !h?.isTop)
    return Math.max(0, list.length - 1)
  })

  const value = computed({
    get() {
      if (!editHost?.value) {
        return 0
      }
      let list = appStore.hosts.filter((h) => !h?.isTop)
      if (isTop.value) {
        list = appStore.hosts.filter((h) => !!h?.isTop)
      }
      return list.length - 1 - list.findIndex((h) => h === editHost?.value)
    },
    set(v: number) {
      if (!editHost?.value) {
        return
      }
      console.log('value: ', v)
      const list = appStore.hosts.filter((h) => !!h?.isTop)
      const rawIndex = appStore.hosts.findIndex((h) => h === editHost.value)
      if (rawIndex >= 0) {
        appStore.hosts.splice(rawIndex, 1)
        let index = v
        if (!isTop.value) {
          index += list.length
        }
        appStore.hosts.splice(index, 0, editHost.value as any)
      }
    }
  })
</script>
