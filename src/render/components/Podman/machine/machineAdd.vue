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
        <el-form-item v-if="!isEdit" :label="I18nT('podman.DiskSize')" prop="disk">
          <el-input-number v-model="form.disk" :min="10240" :max="1048576" />
          <span class="ml-2 text-xs">MB</span>
        </el-form-item>
        <el-form-item v-if="!isEdit" :label="I18nT('podman.isDefault')" prop="isDefault">
          <el-switch v-model="form.isDefault" />
        </el-form-item>
        <el-form-item :label="I18nT('podman.rootful')" prop="rootful">
          <el-switch v-model="form.rootful" />
        </el-form-item>
        <el-form-item v-if="!isEdit" :label="I18nT('podman.rosetta')" prop="rosetta">
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
        <el-button type="primary" :loading="submitting" @click="onSubmit">{{ I18nT('base.confirm') }}</el-button>
        <el-button @click="onCancel">{{ I18nT('base.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'
  import IPC from '@/util/IPC'
  import { PodmanManager } from '@/components/Podman/class/Podman'

  const props = defineProps<{ item?: any }>()
  const isEdit = !!props.item

  const visible = ref(true)
  const submitting = ref(false)
  const formRef = ref()
  const form = ref({
    name: '',
    cpus: 4,
    memory: 4096,
    disk: 20480,
    isDefault: false,
    rootful: false,
    rosetta: false,
    identityPath: '',
    remoteUsername: ''
  })

  // 获取最新的 machine 数据
  const currentMachine = computed(() => {
    if (!isEdit || !props.item?.name) return null
    return PodmanManager.machine.find((m) => m.name === props.item.name)
  })

  // 从 machine 加载配置到表单
  const loadFormFromMachine = () => {
    const machine = currentMachine.value
    if (isEdit && machine?.info?.Resources) {
      const info = machine.info
      form.value.name = machine.name ?? ''
      form.value.cpus = info.Resources.CPUs ?? 2
      form.value.memory = info.Resources.Memory ?? 2048
      form.value.disk = info.Resources.DiskSize ?? 20480
      form.value.rootful = info.Rootful ?? false
      form.value.rosetta = info.Rosetta ?? false
    } else if (isEdit && props.item?.info?.Resources) {
      // 使用传入的 item 数据（初始化时）
      const info = props.item.info
      form.value.name = props.item.name ?? ''
      form.value.cpus = info.Resources.CPUs ?? 2
      form.value.memory = info.Resources.Memory ?? 2048
      form.value.disk = info.Resources.DiskSize ?? 20480
      form.value.rootful = info.Rootful ?? false
      form.value.rosetta = info.Rosetta ?? false
    } else {
      Object.assign(form.value, props?.item)
    }
  }

  // 初始化加载
  loadFormFromMachine()

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
    if (submitting.value) return
    submitting.value = true
    try {
      if (!isEdit) {
        // 新增虚拟机 IPC.send 返回的不是Promise 而是包含then的对象
        IPC.send('app-fork:podman', 'machineInit', JSON.parse(JSON.stringify(form.value))).then(
          (key: string, res: any) => {
            IPC.off(key)
            submitting.value = false
            if (res?.code === 0) {
              ElMessage.success(I18nT('base.success'))
              visible.value = false
              // 刷新虚拟机列表
              PodmanManager.reinit()
            } else {
              ElMessage.error(res?.msg ?? I18nT('base.fail'))
            }
          }
        )
      } else {
        // 编辑虚拟机
        const machineName = currentMachine.value?.name || props.item?.name
        if (!machineName) {
          submitting.value = false
          ElMessage.error(I18nT('base.fail'))
          return
        }
        const editData = {
          name: machineName,
          cpus: form.value.cpus,
          memory: form.value.memory,
          rootful: form.value.rootful
        }
        IPC.send('app-fork:podman', 'machineSet', JSON.parse(JSON.stringify(editData))).then(
          (key: string, res: any) => {
            IPC.off(key)
            submitting.value = false
            if (res?.code === 0) {
              ElMessage.success(I18nT('base.success'))
              visible.value = false
              // 刷新虚拟机列表
              PodmanManager.reinit()
            } else {
              ElMessage.error(res?.msg ?? I18nT('base.fail'))
            }
          }
        )
      }
    } catch (e: any) {
      submitting.value = false
      ElMessage.error(e?.message ?? I18nT('base.fail'))
    }
  }
</script>
