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
      <div class="nav pl-3 pr-5">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3 truncate"
            >{{ I18nT('base.errorLog') }} - {{ version.version }} - {{ version.path }}</span
          >
        </div>
      </div>
      <div class="main-wapper">
        <LogVM ref="log" :log-file="file" />
      </div>
      <ToolVM :log="log" />
    </div>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import type { SoftInstalled } from '@/store/brew'
  import IPC from '@/util/IPC'
  import { ConfStore } from '@/components/Conf/setup'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const log = ref()

  const file = ref('')

  const flag = computed(() => {
    return props?.version?.phpBin ?? props?.version?.path
  })

  const iniFile = computed(() => {
    return ConfStore.phpIniFiles?.[flag?.value] ?? ''
  })

  IPC.send(
    'app-fork:php',
    'getErrorLogPathFromIni',
    JSON.parse(JSON.stringify(props.version)),
    iniFile.value
  ).then((key: string, res: any) => {
    console.log(res)
    IPC.off(key)
    if (res.code === 0) {
      file.value = res.data
    }
  })

  const close = () => {
    show.value = false
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
