<template>
  <el-form :model="form" label-position="top">
    <BaseVM :image="image" :form-name="formName" />

    <PreviewVM :form-name="formName" />
  </el-form>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { ComposeBuildForm } from '@/components/Podman/compose-build/Form'
  import { OfficialImages } from '@/components/Podman/officialImages'
  import BaseVM from '@/components/Podman/compose-build/components/base.vue'
  import PreviewVM from '@/components/Podman/compose-build/components/preview.vue'

  const formName = 'Mailpit'
  const image = OfficialImages.mailpit?.image ?? ''

  const form = computed(() => {
    return ComposeBuildForm.Mailpit
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
