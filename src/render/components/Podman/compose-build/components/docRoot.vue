<template>
  <el-form-item :label="I18nT('host.runDirectory')" prop="docRoot">
    <el-select v-model="form.docRoot">
      <el-option label="/" :value="'/'"></el-option>
      <template v-for="(d, _d) in subdirs" :key="_d">
        <el-option :value="d" :label="d"></el-option>
      </template>
    </el-select>
  </el-form-item>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { ComposeBuildForm } from '@/components/Podman/compose-build/Form'
  import { fs } from '@/util/NodeFn'
  import { asyncComputed } from '@vueuse/core'
  import { I18nT } from '@lang/index'

  const props = defineProps<{
    formName: any
  }>()

  const form = computed(() => {
    return ComposeBuildForm[props.formName]
  })

  const subdirs = asyncComputed(async () => {
    const root = form.value.wwwRoot
    return await fs.subdir(root)
  })
</script>

<style scoped>
  pre {
    background: #f5f7fa;
    padding: 16px;
    border-radius: 4px;
    overflow: auto;
  }
</style>
