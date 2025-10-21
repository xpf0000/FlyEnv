<template>
  <el-form label-position="top">
    <BaseVM :image="image" :form-name="formName" />
    <WwwRoot :form-name="formName" />
    <DocRoot :form-name="formName" />
    <PreviewVM :form-name="formName" />
  </el-form>
</template>

<script lang="ts" setup>
  import { OfficialImages } from '@/components/Podman/officialImages'
  import BaseVM from '@/components/Podman/compose-build/components/base.vue'
  import PreviewVM from '@/components/Podman/compose-build/components/preview.vue'
  import WwwRoot from '@/components/Podman/compose-build/components/wwwRoot.vue'
  import DocRoot from '@/components/Podman/compose-build/components/docRoot.vue'

  const formName = 'Nginx'
  const image = OfficialImages.nginx?.image ?? ''
</script>

<style scoped>
  pre {
    background: #f5f7fa;
    padding: 16px;
    border-radius: 4px;
    overflow: auto;
  }
</style>
