<template>
  <el-form :model="form" label-position="top">
    <BaseVM :image="image" :form-name="formName" />

    <el-form-item :label="I18nT('podman.Persistence')" prop="persistence">
      <el-switch v-model="form.persistence"></el-switch>
    </el-form-item>

    <el-form-item label="Password">
      <el-input v-model="form.environment.REDIS_PASSWORD" placeholder="REDIS_PASSWORD"></el-input>
    </el-form-item>

    <PreviewVM :form-name="formName" />
  </el-form>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { ComposeBuildForm } from '@/components/Podman/compose-build/Form'
  import { I18nT } from '@lang/index'
  import { OfficialImages } from '@/components/Podman/officialImages'
  import BaseVM from '@/components/Podman/compose-build/components/base.vue'
  import PreviewVM from '@/components/Podman/compose-build/components/preview.vue'

  const formName = 'Redis'
  const image = OfficialImages.redis?.image ?? ''

  const form = computed(() => {
    return ComposeBuildForm.Redis
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
