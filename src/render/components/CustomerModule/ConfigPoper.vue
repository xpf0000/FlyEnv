<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15 title">{{ file }}</span>
        </div>
      </div>

      <Conf
        :show-load-default="false"
        :type-flag="'node'"
        :file="file"
        :file-ext="ext"
        :show-commond="false"
      >
      </Conf>
    </div>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import Conf from '@/components/Conf/drawer.vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { extname } from 'path-browserify'

  const props = defineProps<{
    file: string
  }>()

  const ext = computed(() => {
    return extname(props.file) || 'conf'
  })

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
