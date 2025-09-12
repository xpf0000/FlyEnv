<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
    @open="onOpen"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3 title">{{ item.path }}</span>
        </div>
      </div>

      <Conf
        ref="conf"
        :type-flag="'php'"
        :show-load-default="false"
        :file="file"
        :file-ext="'ini'"
        :show-commond="false"
      >
      </Conf>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import Conf from '@/components/Conf/drawer.vue'
  import type { Compose } from '@/components/Podman/class/Compose'

  const props = defineProps<{
    item: Compose
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const file = computed(() => {
    return props.item.path
  })

  const conf = ref()

  const onOpen = () => {
    if (conf?.value?.onEditerInited) {
      conf.value.onEditerInited(() => {
        console.log('onEditerInited !!!!!!')
        conf.value.setEditLanguage('yaml')
      })
    } else {
      console.log('no conf?.value?.onEditerInited !!!!!!')
    }
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
