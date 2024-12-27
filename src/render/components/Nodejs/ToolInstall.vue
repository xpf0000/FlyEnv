<template>
  <template v-if="toolInstalling">
    <div ref="logRef" class="logs cli-to-html" style="padding: 20px">
      {{ logs?.join('') ?? '' }}
    </div>
  </template>
  <template v-else>
    <el-form style="margin-top: 15px; padding: 20px" label-position="left" label-width="150px">
      <div class="mb-4">{{ I18nT('nodejs.noInstallTips', { app: tool }) }}</div>
      <el-button type="primary" @click.stop="doInstallTool">{{
        $t('util.nodeToolInstallBtn')
      }}</el-button>
    </el-form>
  </template>
</template>

<script lang="ts" setup>
  import { ref, computed, watch, nextTick, onMounted } from 'vue'
  import { NodejsStore } from '@/components/Nodejs/node'
  import { I18nT } from '@shared/lang'

  const props = defineProps<{
    tool: 'fnm' | 'nvm'
  }>()

  const nodejsStore = NodejsStore()

  const logRef = ref()

  const toolInstalling = computed(() => {
    return nodejsStore.toolInstalling[props.tool]
  })

  const logs = computed(() => {
    return nodejsStore.logs
  })

  const logLength = computed(() => {
    return logs.value.length
  })

  const logScroll = () => {
    nextTick().then(() => {
      let container: HTMLElement = logRef.value as any
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  }

  watch(logLength, () => {
    logScroll()
  })

  const doInstallTool = () => {
    nodejsStore.doInstallTool(props.tool)?.then()
  }

  onMounted(() => {
    logScroll()
    if (!toolInstalling.value) {
      nodejsStore.chekTool()
    }
  })
</script>
