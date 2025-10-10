<template>
  <el-form ref="formRef" label-width="110px" label-position="top" class="pt-2">
    <el-form-item :label="I18nT('base.name')" prop="name">
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item prop="path" :label="I18nT('podman.ComposeFileSaveDir')">
      <el-input v-model="form.dir" />
    </el-form-item>
    <el-form-item :label="I18nT('host.projectName')" prop="flag">
      <el-input v-model="form.flag" placeholder="docker-compose -p xxxx" />
    </el-form-item>
    <el-form-item :label="I18nT('host.comment')" prop="comment">
      <el-input v-model="form.comment" type="textarea" :rows="4" />
    </el-form-item>
  </el-form>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { ComposeBuildForm } from '@/components/Podman/compose-build/Form'

  const form = computed(() => {
    return ComposeBuildForm.base
  })
</script>
