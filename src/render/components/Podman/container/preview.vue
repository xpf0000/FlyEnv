<template>
  <el-form-item>
    <el-button type="primary" @click="generateCompose"
      >Docker Compose {{ I18nT('base.preview') }}</el-button
    >
  </el-form-item>

  <el-dialog
    v-model="dialogVisible"
    class="el-dialog-content-flex-1 h-[75vh]"
    title="Docker Compose"
    width="600px"
    :destroy-on-close="true"
  >
    <el-scrollbar class="h-full overflow-hidden">
      <pre>{{ composeYaml }}</pre>
    </el-scrollbar>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ I18nT('menu.close') }}</el-button>
      <el-button type="primary" @click="copyToClipboard">{{ I18nT('base.copy') }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { MessageSuccess } from '@/util/Element'
  import { generateComposeFile } from '@/components/Podman/container/util'

  const props = defineProps<{
    form: any
  }>()

  const dialogVisible = ref(false)
  const composeYaml = ref('')

  const generateCompose = () => {
    composeYaml.value = generateComposeFile(props.form)
    dialogVisible.value = true
  }

  // 复制到剪贴板
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(composeYaml.value)
      MessageSuccess(I18nT('base.copySuccess'))
    } catch (err) {
      console.error('复制失败:', err)
    }
  }
</script>

<style scoped>
  pre {
    background: #f5f7fa;
    padding: 16px;
    border-radius: 4px;
    overflow: auto;
  }
</style>
