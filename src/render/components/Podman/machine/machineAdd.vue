<template>
  <el-dialog
    v-model="visible"
    :title="
      isEdit
        ? I18nT('base.edit') + I18nT('podman.Machine')
        : I18nT('podman.Machine') + I18nT('base.add')
    "
    width="600px"
    class="el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    @closed="closedFn"
  >
    <el-scrollbar class="px-2">
      <el-form ref="formRef" :model="form" label-width="110px" class="pt-2" label-position="top">
        <el-form-item v-if="!isEdit" :label="I18nT('base.name')" prop="name" required>
          <el-input v-model="form.name" maxlength="32" />
        </el-form-item>
        <el-form-item :label="I18nT('podman.CPU')" prop="cpus">
          <el-input-number v-model="form.cpus" :min="1" :max="16" />
        </el-form-item>
        <el-form-item :label="I18nT('podman.Memory')" prop="memory">
          <el-input-number v-model="form.memory" :min="512" :max="32768" />
          <span class="ml-2 text-xs">MB</span>
        </el-form-item>
        <el-form-item :label="I18nT('podman.DiskSize')" prop="disk">
          <el-input-number v-model="form.disk" :min="10240" :max="1048576" />
          <span class="ml-2 text-xs">MB</span>
        </el-form-item>
        <el-form-item v-if="!isEdit" :label="I18nT('podman.isDefault')" prop="isDefault">
          <el-switch v-model="form.isDefault" />
        </el-form-item>
        <el-form-item :label="I18nT('podman.rootful')" prop="rootful">
          <el-switch v-model="form.rootful" />
        </el-form-item>
        <el-form-item :label="I18nT('podman.userModeNetworking')" prop="userModeNetworking">
          <el-switch v-model="form.userModeNetworking" />
        </el-form-item>
        <el-form-item :label="I18nT('podman.rosetta')" prop="rosetta">
          <el-switch v-model="form.rosetta" />
        </el-form-item>
        <el-form-item v-if="!isEdit" :label="I18nT('podman.identityPath')" prop="identityPath">
          <el-input v-model="form.identityPath" placeholder="~/.ssh/id_rsa" />
        </el-form-item>
        <el-form-item v-if="!isEdit" :label="I18nT('podman.remoteUsername')" prop="remoteUsername">
          <el-input v-model="form.remoteUsername" placeholder="user" />
        </el-form-item>
      </el-form>
    </el-scrollbar>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" @click="onSubmit">{{ I18nT('base.confirm') }}</el-button>
        <el-button @click="onCancel">{{ I18nT('base.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'

  const props = defineProps<{ item?: any }>()
  const isEdit = !!props.item

  const visible = ref(true)
  const formRef = ref()
  const form = ref({
    name: '',
    cpus: 2,
    memory: 2048,
    disk: 20480,
    isDefault: false,
    rootful: false,
    userModeNetworking: false,
    rosetta: false,
    identityPath: '',
    remoteUsername: ''
  })
  Object.assign(form.value, props?.item)

  const closedFn = () => {
    visible.value = false
  }

  const onCancel = () => {
    visible.value = false
  }

  const onSubmit = async () => {
    if (!form.value.name && !isEdit) {
      ElMessage.error(I18nT('base.name') + I18nT('podman.require'))
      return
    }
    try {
      // 新增或编辑逻辑
      ElMessage.success(I18nT('base.success'))
      visible.value = false
      // 可选：PodmanManager.refresh()
    } catch (e: any) {
      ElMessage.error(e?.message ?? I18nT('base.fail'))
    }
  }
</script>
