<template>
  <el-card class="h-full overflow-hidden install-panel">
    <div class="w-full h-full overflow-hidden">
      <template v-if="store.installing">
        <div class="w-full h-full overflow-hidden p-2">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else>
        <div class="p-3">
          <p class="mb-3">{{ I18nT('aicli.notInstalledTips', { name: store.tool?.name }) }}</p>
          <template v-if="store.tool?.depCmd && store.depOk[store.currentFlag] === false">
            <el-alert
              type="warning"
              :closable="false"
              class="mb-3"
              :title="I18nT('aicli.depMissing', { dep: store.tool?.depLabel })"
            />
          </template>
          <el-button type="primary" :disabled="store.installing" @click="doInstall">
            {{ I18nT('base.install') }}
          </el-button>
        </div>
      </template>
    </div>
    <template v-if="store.installing" #footer>
      <el-button v-if="store.installEnd" type="primary" @click="store.taskConfirm()">
        {{ I18nT('base.confirm') }}
      </el-button>
      <el-button v-else @click="store.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, onMounted, onUnmounted, nextTick } from 'vue'
  import { I18nT } from '@lang/index'
  import { AICliSetup } from './setup'
  import XTerm from '@/util/XTerm'

  const store = AICliSetup
  const xtermDom = ref()

  const doInstall = () => {
    store.install(xtermDom)
  }

  onMounted(() => {
    if (store.installing) {
      nextTick().then(() => {
        const x: XTerm = store.xterm as any
        if (x && xtermDom.value) {
          x.mount(xtermDom.value).then().catch()
        }
      })
    }
  })
  onUnmounted(() => {
    store?.xterm?.unmounted?.()
  })
</script>
