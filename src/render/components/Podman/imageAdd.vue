<template>
  <el-dialog
    v-model="visible"
    :title="I18nT('podman.Image') + I18nT('base.add')"
    width="600px"
    class="host-edit new-project"
    :class="{
      installing: loading
    }"
    @closed="closedFn"
  >
    <el-form :model="form" label-width="110px" class="pt-2">
      <el-form-item :label="I18nT('podman.Image')" prop="name" required>
        <el-input v-model="form.name" placeholder="e.g. nginx" />
      </el-form-item>
      <el-form-item :label="I18nT('podman.Tag')" prop="tag">
        <el-input v-model="form.tag" placeholder="latest" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSubmit">{{ I18nT('base.confirm') }}</el-button>
        <el-button @click="onCancel">{{ I18nT('base.cancel') }}</el-button>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'
  import { PodmanManager } from '@/components/Podman/class/Podman'

  const visible = ref(true)
  const form = ref({
    name: '',
    tag: 'latest'
  })

  const closedFn = () => {
    visible.value = false
  }

  const onCancel = () => {
    visible.value = false
  }

  const onSubmit = async () => {
    if (!form.value.name) {
      ElMessage.error(I18nT('podman.Image') + I18nT('podman.require'))
      return
    }
    try {
      await PodmanManager.pullImage(form.value.name, form.value.tag)
      ElMessage.success(I18nT('base.success'))
      visible.value = false
      PodmanManager.refresh()
    } catch (e: any) {
      ElMessage.error(e?.message ?? I18nT('base.fail'))
    }
  }
</script>
