<template>
  <el-dialog
    v-model="show"
    :title="
      isEdit
        ? I18nT('base.edit') + I18nT('podman.Container')
        : I18nT('podman.Container') + I18nT('base.add')
    "
    class="el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    width="700px"
    @closed="closedFn"
  >
    <el-scrollbar class="px-2">
      <el-form ref="formRef" :model="form" label-position="top" class="pt-2">
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

        <el-form-item :label="I18nT('base.name')" prop="name" required :show-message="false">
          <el-input v-model="form.name" maxlength="32" />
        </el-form-item>

        <el-form-item :label="I18nT('podman.Image')" prop="image" required :show-message="false">
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
                <el-button
                  class="flex-shrink-0 ml-4"
                  link
                  :icon="Delete"
                  @click.stop="removePort(_p)"
                ></el-button>
              </div>
            </template>
          </div>
        </el-form-item>

        <el-form-item :label="I18nT('podman.Volumes')" prop="volumes">
          <template #label>
            <div class="inline-flex items-center gap-3">
              <span>{{ I18nT('podman.Volumes') }}</span>
              <el-button link type="primary" :icon="Plus" @click.stop="addVolumes"></el-button>
            </div>
          </template>
          <div class="w-full flex flex-col gap-3">
            <template v-for="(p, _p) in form.volumes" :key="_p">
              <div class="w-full flex items-center justify-between">
                <el-input v-model="p.in" :placeholder="I18nT('podman.ContainerDir')" class="flex-1">
                  <template #prefix>
                    <span>{{ I18nT('podman.ContainerDir') }}</span>
                  </template>
                </el-input>
                <span class="mx-3 flex-shrink-0">→</span>
                <el-input v-model="p.out" :placeholder="I18nT('podman.LocalDir')" class="flex-1">
                  <template #prefix>
                    <span>{{ I18nT('podman.LocalDir') }}</span>
                  </template>
                  <template #append>
                    <el-button :icon="FolderOpened" @click.stop="chooseVolume(_p)"></el-button>
                  </template>
                </el-input>
                <el-button
                  class="flex-shrink-0 ml-4"
                  link
                  :icon="Delete"
                  @click.stop="removeVolume(_p)"
                ></el-button>
              </div>
            </template>
          </div>
        </el-form-item>

        <el-form-item :label="I18nT('podman.ContainerEnvVars')" prop="env">
          <template #label>
            <div class="inline-flex items-center gap-3">
              <span>{{ I18nT('podman.ContainerEnvVars') }}</span>
              <el-button link type="primary" :icon="Plus" @click.stop="addEnv"></el-button>
            </div>
          </template>
          <div class="w-full flex flex-col gap-3">
            <template v-for="(item, _index) in form.env" :key="_index">
              <div class="w-full flex items-center justify-between gap-3">
                <el-input
                  v-model="item.name"
                  :placeholder="I18nT('host.envVar')"
                  class="w-[140px] flex-shrink-0"
                >
                </el-input>
                <el-input
                  v-model="item.value"
                  :placeholder="I18nT('tools.envValue')"
                  class="flex-1"
                >
                </el-input>
                <el-button
                  class="flex-shrink-0 ml-4"
                  link
                  :icon="Delete"
                  @click.stop="removeEnv(_index)"
                ></el-button>
              </div>
            </template>
          </div>
        </el-form-item>

        <el-form-item :label="I18nT('podman.NetworkMode')" prop="network">
          <el-select v-model="form.networkMode" :placeholder="I18nT('podman.NetworkMode')">
            <el-option label="bridge" value="bridge" />
            <el-option label="host" value="host" />
            <el-option label="none" value="none" />
          </el-select>
        </el-form-item>

        <el-form-item :label="I18nT('podman.NetworkName')" prop="network">
          <el-input v-model="form.networkName" :placeholder="I18nT('podman.NetworkName')">
          </el-input>
        </el-form-item>

        <el-form-item :label="I18nT('podman.Interactive')" prop="interactive">
          <el-switch v-model="form.interactive" />
        </el-form-item>

        <el-form-item :label="I18nT('podman.TTY')" prop="tty">
          <el-switch v-model="form.tty" />
        </el-form-item>

        <el-form-item :label="I18nT('podman.RestartPolicy')" prop="restart">
          <el-select v-model="form.restart" :placeholder="I18nT('podman.RestartPolicy')">
            <el-option label="no" value="no" />
            <el-option label="on-failure" value="on-failure" />
            <el-option label="always" value="always" />
            <el-option label="unless-stopped" value="unless-stopped" />
          </el-select>
        </el-form-item>

        <Preview :form="form" />
      </el-form>
    </el-scrollbar>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click.stop="onCancel">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click.stop="doSubmit">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref, onMounted, computed, reactive } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import type { Image } from '@/components/Podman/class/Image'
  import { Delete, FolderOpened, Plus } from '@element-plus/icons-vue'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import Preview from './preview.vue'
  import { dialog, fs } from '@/util/NodeFn'
  import { generateComposeFile } from '@/components/Podman/container/util'
  import { XTermExec, XTermExecCache } from '@/util/XTermExec'
  import { reactiveBind } from '@/util/Index'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{ item?: any }>()
  const isEdit = !!props.item

  const formRef = ref()

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const images = computed<Image[]>(() => {
    return machine?.value?.images ?? []
  })

  type BindType = {
    in: number
    out: number
  }

  const form = ref({
    dir: '',
    name: '',
    image: '',
    command: '',
    args: '',
    ports: [] as Array<BindType>,
    volumes: [] as Array<BindType>,
    env: [] as Array<{ name: string; value: string }>,
    networkMode: 'bridge',
    networkName: '',
    interactive: false,
    tty: false,
    restart: 'no'
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

  // 初始化表单数据（如果是编辑模式）
  onMounted(() => {
    if (isEdit && props.item) {
      Object.assign(form.value, props.item)
    }
  })

  const addPort = () => {
    form.value.ports.push(
      reactive({
        in: undefined,
        out: undefined
      } as any)
    )
  }

  const addEnv = () => {
    form.value.env.push(
      reactive({
        name: undefined,
        value: undefined
      } as any)
    )
  }

  const chooseVolume = (index: number) => {
    const opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
    dialog
      .showOpenDialog({
        properties: opt
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        form.value.volumes[index].out = path
      })
  }

  const addVolumes = () => {
    form.value.volumes.push(
      reactive({
        in: undefined,
        out: undefined
      } as any)
    )
  }

  const removePort = (index: number) => {
    form.value.ports.splice(index, 1)
  }

  const removeVolume = (index: number) => {
    form.value.volumes.splice(index, 1)
  }

  const removeEnv = (index: number) => {
    form.value.env.splice(index, 1)
  }

  const onCancel = () => {
    show.value = false
  }

  const doSubmit = async () => {
    if (!form.value.name) {
      ElMessage.error(I18nT('podman.ContainerNameRequired'))
      return
    }
    if (!form.value.image) {
      ElMessage.error(I18nT('podman.ContainerImageRequired'))
      return
    }
    if (!form.value.dir) {
      ElMessage.error(I18nT('podman.ComposeFileSaveDir') + I18nT('podman.require'))
      return
    }

    machine.value!.containerCreating = true
    const content = generateComposeFile(form.value)
    await fs.writeFile(form.value.dir, content)
    const id = 'FlyEnv-Podman-Container-Create'
    let xtermExec = XTermExecCache?.[id]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      const arr: string[] = [`docker-compose -f ${form.value.dir}`]
      const logs: string[] = [...arr, 'logs']
      arr.push('up -d')
      xtermExec.cammand = [arr.join(' '), logs.join(' ')]
      xtermExec.wait().then(() => {
        delete XTermExecCache?.[id]
        machine.value?.fetchContainers?.()
        machine.value!.containerCreating = false
      })
      XTermExecCache[id] = xtermExec
    }
    import('@/components/XTermExecDialog/index.vue').then((res) => {
      AsyncComponentShow(res.default, {
        title: I18nT('podman.StartWithTerminal'),
        item: xtermExec
      }).then(() => {
        machine.value?.fetchContainers?.()
      })
    })
    onCancel()
  }

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
