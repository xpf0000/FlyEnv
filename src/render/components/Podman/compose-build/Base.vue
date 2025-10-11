<template>
  <el-form ref="formRef" :model="form" label-width="110px" label-position="top" class="pt-2">
    <el-form-item :label="I18nT('base.name')" prop="name" required :show-message="false">
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item
      prop="dir"
      :label="I18nT('podman.ComposeFileSaveDir')"
      required
      :show-message="false"
    >
      <el-input v-model="form.dir">
        <template #append>
          <el-button :icon="FolderOpened" @click.stop="chooseDir"></el-button>
        </template>
      </el-input>
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
  import { FolderOpened } from '@element-plus/icons-vue'
  import { dialog } from '@/util/NodeFn'

  const form = computed(() => {
    return ComposeBuildForm.base
  })

  const chooseDir = () => {
    dialog
      .showSaveDialog({
        defaultPath: 'docker-compose.yml'
      })
      .then(({ canceled, filePath }: any) => {
        if (canceled || !filePath) {
          return
        }
        form.value.dir = filePath
      })
  }
</script>
