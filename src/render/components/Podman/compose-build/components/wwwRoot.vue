<template>
  <el-form-item :label="I18nT('host.placeholderRootPath')" prop="wwwRoot" :show-message="false">
    <el-input v-model="form.wwwRoot">
      <template #append>
        <el-button :icon="Folder" @click="selectDirectory"></el-button>
      </template>
    </el-input>
  </el-form-item>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { ComposeBuildForm } from '@/components/Podman/compose-build/Form'
  import { Folder } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { ComposeBuildSetup } from '@/components/Podman/compose-build/setup'

  const props = defineProps<{
    formName: any
  }>()

  const form = computed(() => {
    return ComposeBuildForm[props.formName]
  })

  const { selectDirectory } = ComposeBuildSetup(form)
</script>

<style scoped>
  pre {
    background: #f5f7fa;
    padding: 16px;
    border-radius: 4px;
    overflow: auto;
  }
</style>
