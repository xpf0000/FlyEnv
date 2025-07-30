<template>
  <li class="non-draggable">
    <div class="left">
      <div class="icon-block" :class="{ run: item.run }">
        <yb-icon :key="iconKey" :svg="icon" width="30" height="30" />
      </div>
      <span class="title">{{ item.label }}</span>
    </div>

    <el-switch
      v-model="run"
      :disabled="item.running"
      :loading="item.running"
      @change="switchChange(item?.id ?? item.typeFlag)"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { type CustomerModuleItem } from './store/app'
  import { uuid } from '@/util/Index'
  import IPC from '@/util/IPC'

  const props = defineProps<{
    item: CustomerModuleItem
  }>()

  const run = computed({
    get() {
      return props.item.run
    },
    set() {
      const item: CustomerModuleItem = props.item
      item.running = true
    }
  })

  const iconKey = ref(uuid())

  const icon = computed(() => {
    return props.item.icon
  })

  watch(icon, () => {
    iconKey.value = uuid()
  })

  const switchChange = (flag: string) => {
    IPC.send('APP:Tray-Command', 'switchChange', flag).then((key: string) => {
      IPC.off(key)
    })
  }
</script>
