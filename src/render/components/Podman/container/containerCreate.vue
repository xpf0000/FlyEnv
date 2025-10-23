<template>
  <el-dialog
    v-model="visible"
    :title="
      isEdit
        ? I18nT('base.edit') + I18nT('podman.Container')
        : I18nT('podman.Container') + I18nT('base.add')
    "
    width="700px"
    @closed="closedFn"
  >
    <el-form ref="formRef" :model="form" label-width="130px" class="pt-2">
      <el-form-item :label="I18nT('base.name')" prop="name">
        <el-input v-model="form.name" maxlength="32" />
      </el-form-item>

      <el-form-item :label="I18nT('podman.Image')" prop="image" required>
        <el-select v-model="form.image" filterable style="width: 100%">
          <el-option
            v-for="img in images"
            :key="img.id"
            :label="img.name.join(',')"
            :value="img.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="I18nT('setup.module.command')" prop="command">
        <el-input v-model="form.command" />
      </el-form-item>

      <el-form-item :label="I18nT('podman.CommandArgs')" prop="args">
        <el-input v-model="form.args" />
      </el-form-item>

      <el-form-item :label="I18nT('podman.PortBind')" prop="ports">
        <template #label>
          <div class="inline-flex items-center gap-3">
            <span>{{ I18nT('podman.PortBind') }}</span>
            <el-button link type="primary" :icon="Plus" @click.stop="addPort"></el-button>
          </div>
        </template>
        <div class="w-full flex flex-col gap-3">
          <template v-for="(p, _p) in form.ports" :key="_p">
            <div class="w-full flex items-center justify-between">
              <el-input
                v-model="p.in"
                readonly
                disabled
                :placeholder="I18nT('podman.ContainerPort')"
                class="flex-1"
              >
                <template #prefix>
                  <span>{{ I18nT('podman.ContainerPort') }}</span>
                </template>
              </el-input>
              <span class="mx-3 flex-shrink-0">→</span>
              <el-input v-model="p.out" :placeholder="I18nT('podman.LocalPort')" class="flex-1">
                <template #prefix>
                  <span>{{ I18nT('podman.LocalPort') }}</span>
                </template>
              </el-input>
              <el-button class="flex-shrink-0 ml-4" link :icon="Delete"></el-button>
            </div>
          </template>
        </div>
      </el-form-item>

      <el-form-item :label="I18nT('podman.Volumes')" prop="volumes">
        <template #label>
          <div class="inline-flex items-center gap-3">
            <span>{{ I18nT('podman.Volumes') }}</span>
            <el-button link type="primary" :icon="Plus" @click.stop="addPort"></el-button>
          </div>
        </template>
        <div class="w-full flex flex-col gap-3">
          <template v-for="(p, _p) in form.ports" :key="_p">
            <div class="w-full flex items-center justify-between">
              <el-input
                v-model="p.in"
                readonly
                disabled
                :placeholder="I18nT('podman.ContainerPort')"
                class="flex-1"
              >
                <template #prefix>
                  <span>{{ I18nT('podman.ContainerPort') }}</span>
                </template>
              </el-input>
              <span class="mx-3 flex-shrink-0">→</span>
              <el-input v-model="p.out" :placeholder="I18nT('podman.LocalPort')" class="flex-1">
                <template #prefix>
                  <span>{{ I18nT('podman.LocalPort') }}</span>
                </template>
              </el-input>
              <el-button class="flex-shrink-0 ml-4" link :icon="Delete"></el-button>
            </div>
          </template>
        </div>
      </el-form-item>

      <el-form-item :label="I18nT('podman.EnvVars')" prop="env">
        <el-tag v-for="(env, index) in form.env" :key="index" closable @close="removeEnv(index)">
          {{ env.name }}={{ env.value }}
        </el-tag>
        <el-button class="ml-2" size="small" @click="addEnv">
          {{ I18nT('base.add') }}
        </el-button>
      </el-form-item>

      <el-form-item :label="I18nT('podman.Network')" prop="network">
        <el-select v-model="form.network" :placeholder="I18nT('podman.selectNetwork')">
          <el-option label="bridge" value="bridge" />
          <el-option label="host" value="host" />
          <el-option label="none" value="none" />
        </el-select>
      </el-form-item>

      <el-form-item :label="I18nT('podman.AutoRemove')" prop="autoRemove">
        <el-switch v-model="form.autoRemove" />
      </el-form-item>

      <el-form-item :label="I18nT('podman.Interactive')" prop="interactive">
        <el-switch v-model="form.interactive" />
      </el-form-item>

      <el-form-item :label="I18nT('podman.TTY')" prop="tty">
        <el-switch v-model="form.tty" />
      </el-form-item>

      <el-form-item :label="I18nT('podman.RestartPolicy')" prop="restart">
        <el-select v-model="form.restart" :placeholder="I18nT('podman.selectRestartPolicy')">
          <el-option label="no" value="no" />
          <el-option label="on-failure" value="on-failure" />
          <el-option label="always" value="always" />
          <el-option label="unless-stopped" value="unless-stopped" />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="onSubmit">{{ I18nT('base.confirm') }}</el-button>
        <el-button @click="onCancel">{{ I18nT('base.cancel') }}</el-button>
      </el-form-item>
    </el-form>

    <!-- 端口添加对话框 -->
    <el-dialog v-model="portDialogVisible" :title="I18nT('podman.addPort')" width="400px">
      <el-form :model="newPort" label-width="100px">
        <el-form-item :label="I18nT('podman.hostPort')" prop="host">
          <el-input-number v-model="newPort.host" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item :label="I18nT('podman.containerPort')" prop="container">
          <el-input-number v-model="newPort.container" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item :label="I18nT('podman.protocol')" prop="protocol">
          <el-select v-model="newPort.protocol">
            <el-option label="tcp" value="tcp" />
            <el-option label="udp" value="udp" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="portDialogVisible = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click="confirmAddPort">{{ I18nT('base.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 其他添加对话框类似 -->
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref, onMounted, computed, reactive } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import type { Image } from '@/components/Podman/class/Image'
  import { Delete, Plus } from '@element-plus/icons-vue'

  const props = defineProps<{ item?: any }>()
  const isEdit = !!props.item

  const visible = ref(true)
  const formRef = ref()
  const imageLoading = ref(false)
  const portDialogVisible = ref(false)
  const volumeDialogVisible = ref(false)
  const envDialogVisible = ref(false)

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const images = computed<Image[]>(() => {
    return machine?.value?.images ?? []
  })

  const newPort = ref({
    host: 8080,
    container: 80,
    protocol: 'tcp'
  })

  const newVolume = ref({
    host: '',
    container: '',
    mode: 'rw'
  })

  const newEnv = ref({
    name: '',
    value: ''
  })

  type BindType = {
    in: number
    out: number
  }

  const form = ref({
    name: '',
    image: '',
    command: '',
    args: '',
    ports: [] as Array<BindType>,
    volumes: [] as Array<BindType>,
    env: [] as Array<{ name: string; value: string }>,
    network: 'bridge',
    autoRemove: false,
    interactive: false,
    tty: false,
    restart: 'no'
  })

  // 初始化表单数据（如果是编辑模式）
  onMounted(() => {
    if (isEdit && props.item) {
      Object.assign(form.value, props.item)
    }
    loadImages()
  })

  const loadImages = async () => {
    imageLoading.value = true
    try {
      // 这里替换为实际的 Podman 镜像列表获取逻辑
      // imageList.value = await PodmanManager.listImages()
      imageList.value = [
        { id: 'nginx', tags: ['nginx:latest'] },
        { id: 'alpine', tags: ['alpine:latest'] },
        { id: 'ubuntu', tags: ['ubuntu:latest'] }
      ]
    } catch (e) {
      ElMessage.error(I18nT('podman.loadImagesFailed'))
    } finally {
      imageLoading.value = false
    }
  }

  const searchImages = async (query: string) => {
    if (query) {
      imageLoading.value = true
      try {
        // 这里替换为实际的搜索逻辑
        // imageList.value = await PodmanManager.searchImages(query)
      } catch (e) {
        ElMessage.error(I18nT('podman.searchImagesFailed'))
      } finally {
        imageLoading.value = false
      }
    }
  }

  const addPort = () => {
    form.value.ports.push(
      reactive({
        in: undefined,
        out: undefined
      } as any)
    )
  }

  const confirmAddPort = () => {
    form.value.ports.push({ ...newPort.value })
    portDialogVisible.value = false
    resetNewPort()
  }

  const removePort = (index: number) => {
    form.value.ports.splice(index, 1)
  }

  const resetNewPort = () => {
    newPort.value = {
      host: 8080,
      container: 80,
      protocol: 'tcp'
    }
  }

  // 类似的添加/删除方法用于 volumes 和 env
  const addVolume = () => {
    volumeDialogVisible.value = true
  }

  const confirmAddVolume = () => {
    form.value.volumes.push({ ...newVolume.value })
    volumeDialogVisible.value = false
    resetNewVolume()
  }

  const removeVolume = (index: number) => {
    form.value.volumes.splice(index, 1)
  }

  const resetNewVolume = () => {
    newVolume.value = {
      host: '',
      container: '',
      mode: 'rw'
    }
  }

  const addEnv = () => {
    envDialogVisible.value = true
  }

  const confirmAddEnv = () => {
    form.value.env.push({ ...newEnv.value })
    envDialogVisible.value = false
    resetNewEnv()
  }

  const removeEnv = (index: number) => {
    form.value.env.splice(index, 1)
  }

  const resetNewEnv = () => {
    newEnv.value = {
      name: '',
      value: ''
    }
  }

  const closedFn = () => {
    visible.value = false
  }

  const onCancel = () => {
    visible.value = false
  }

  const onSubmit = async () => {
    if (!form.value.image) {
      ElMessage.error(I18nT('podman.imageRequired'))
      return
    }

    try {
      // 这里替换为实际的创建/更新容器逻辑
      // if (isEdit) {
      //   await PodmanManager.updateContainer(form.value)
      // } else {
      //   await PodmanManager.createContainer(form.value)
      // }

      ElMessage.success(I18nT('base.success'))
      visible.value = false
      // 可选：触发容器列表刷新
      // PodmanManager.refreshContainers()
    } catch (e: any) {
      ElMessage.error(e?.message ?? I18nT('base.fail'))
    }
  }
</script>
