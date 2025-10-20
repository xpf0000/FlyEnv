<template>
  <el-form :model="form" label-position="top">
    <BaseVM :image="image" :form-name="formName" />

    <el-form-item :label="I18nT('host.placeholderRootPath')" prop="wwwRoot" :show-message="false">
      <el-input v-model="form.wwwRoot">
        <template #append>
          <el-button @click="selectDirectory">选择目录</el-button>
        </template>
      </el-input>
    </el-form-item>

    <el-form-item label="运行目录" prop="docRoot">
      <el-select v-model="form.docRoot">
        <el-option label="/" :value="'/'"></el-option>
        <template v-for="(d, _d) in subdirs" :key="_d">
          <el-option :value="d" :label="d"></el-option>
        </template>
      </el-select>
    </el-form-item>

    <PreviewVM :form-name="formName" />
  </el-form>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { ComposeBuildForm } from '@/components/Podman/compose-build/Form'
  import { fs } from '@/util/NodeFn'
  import { asyncComputed } from '@vueuse/core'
  import { I18nT } from '@lang/index'
  import { OfficialImages } from '@/components/Podman/officialImages'
  import { ComposeBuildSetup } from '@/components/Podman/compose-build/setup'
  import BaseVM from '@/components/Podman/compose-build/components/base.vue'
  import PreviewVM from '@/components/Podman/compose-build/components/preview.vue'

  const formName = 'Nginx'
  const image = OfficialImages.nginx?.image ?? ''

  const form = computed(() => {
    return ComposeBuildForm.Nginx
  })

  const subdirs = asyncComputed(async () => {
    const root = form.value.wwwRoot
    return await fs.subdir(root)
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
