<template>
  <el-dialog
    v-model="show"
    :title="type"
    width="600px"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <template v-if="loading">
          <div ref="xterm" class="h-[263px] overflow-hidden"> </div>
        </template>
        <template v-else>
          <div class="main">
            <div class="path-choose mt-20 mb-20">
              <input
                type="text"
                class="input"
                placeholder="root path"
                :readonly="loading || created ? true : null"
                :value="ProjectSetup.form.NodeJS.dir"
              />
              <div class="icon-block" @click="chooseRoot()">
                <yb-icon
                  :svg="import('@/svg/folder.svg?raw')"
                  class="choose"
                  width="18"
                  height="18"
                />
              </div>
            </div>
            <div class="park">
              <div class="title">
                <span>{{ I18nT('host.nodeJSVersion') }}</span>
              </div>
              <el-select
                v-model="ProjectSetup.form.NodeJS.node"
                class="w-32"
                filterable
                :disabled="loading || created"
              >
                <el-option value="" :label="I18nT('host.useSysVersion')"></el-option>
                <template v-for="(v, k) in nodes" :key="k">
                  <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
                </template>
              </el-select>
            </div>
            <div class="park">
              <div class="title">
                <span>{{ I18nT('host.frameWork') }}</span>
              </div>
              <el-select
                v-model="ProjectSetup.form.NodeJS.version"
                class="w-32"
                filterable
                :disabled="loading || created"
              >
                <template v-for="(v, k) in app.list" :key="k">
                  <el-option :value="v.version" :label="v.name"></el-option>
                </template>
              </el-select>
            </div>
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <template v-if="!created">
          <el-button @click="doStop">{{ I18nT('base.cancel') }}</el-button>
          <el-button
            :loading="loading"
            :disabled="!createAble"
            type="primary"
            @click="doCreateProject"
            >{{ I18nT('base.confirm') }}</el-button
          >
        </template>
        <template v-else>
          <el-button type="primary" @click="doEnd">{{ I18nT('base.confirm') }}</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, markRaw } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import IPC from '@/util/IPC'
  import { I18nT } from '@shared/lang'
  import AppVersions from './version_nodejs'
  import { ProjectSetup } from '@/components/Host/CreateProject/project'
  import XTerm from '@/util/XTerm'

  const { dirname, join } = require('path')
  const { dialog, shell } = require('@electron/remote')
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    type: keyof typeof AppVersions
  }>()

  const xterm = ref<HTMLElement>()

  const app = computed(() => {
    return AppVersions[props.type]
  })

  const loading = computed({
    get() {
      return ProjectSetup.form.NodeJS.running
    },
    set(v) {
      ProjectSetup.form.NodeJS.running = v
    }
  })

  const created = computed({
    get() {
      return ProjectSetup.form.NodeJS.created
    },
    set(v) {
      ProjectSetup.form.NodeJS.created = v
    }
  })

  const createAble = computed(() => {
    return !!ProjectSetup.form.NodeJS.dir && !!ProjectSetup.form.NodeJS.version
  })

  const nodes = ref([])

  IPC.send('app-fork:node', 'allInstalled').then((key: string, res: any) => {
    IPC.off(key)
    if (res?.data) {
      nodes.value = res?.data
      if (!ProjectSetup.form.NodeJS.node && nodes.value.length > 0) {
        const v: any = nodes.value[0]
        ProjectSetup.form.NodeJS.node = v.bin
      }
    }
  })

  const chooseRoot = () => {
    if (loading.value || created.value) {
      return
    }
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        ProjectSetup.form.NodeJS.dir = path
      })
  }

  if (!ProjectSetup.form.NodeJS.version) {
    ProjectSetup.form.NodeJS.version = '*'
  }

  const doCreateProject = () => {
    if (loading.value) {
      return
    }
    loading.value = true
    const form = ProjectSetup.form.NodeJS
    const execXTerm = new XTerm()
    const item = app.value.list.find((f) => f.version === form.version)
    const command: string[] = []
    if (global.Server.Proxy) {
      for (const k in global.Server.Proxy) {
        const v = global.Server.Proxy[k]
        command.push(`export ${k}="${v}"`)
      }
    }
    if (form.node) {
      command.push(`export PATH="${dirname(form.node)}:$PATH"`)
      command.push(`export npm_config_prefix="${dirname(form.node)}"`)
      command.push(`export npm_config_cache="${join(global.Server.UserHome!, '.npm')}"`)
    }
    command.push(`cd "${form.dir}"`)
    const arr = item?.command?.split(';') ?? []
    command.push(...arr)

    nextTick().then(() => {
      execXTerm.mount(xterm.value!).then(() => {
        execXTerm?.send(command)?.then(() => {
          created.value = true
        })
      })
    })
    ProjectSetup.execing.NodeJS = markRaw(execXTerm)
  }

  onMounted(() => {
    if (loading.value) {
      nextTick().then(() => {
        const execXTerm = ProjectSetup.execing.NodeJS
        if (execXTerm && xterm.value) {
          execXTerm.mount(xterm.value)
        }
      })
    }
  })

  onBeforeUnmount(() => {
    const execXTerm = ProjectSetup.execing.NodeJS
    execXTerm?.unmounted()
    if (created.value) {
      execXTerm?.destory()
      created.value = false
      loading.value = false
      delete ProjectSetup.execing.NodeJS
    }
  })

  const doStop = () => {
    if (!loading.value) {
      show.value = false
      return
    }
    const execXTerm = ProjectSetup.execing.NodeJS
    execXTerm?.stop()?.then(() => {
      execXTerm?.destory()
      created.value = false
      loading.value = false
      delete ProjectSetup.execing.NodeJS
    })
  }

  const doEnd = () => {
    ProjectSetup.execing.NodeJS?.destory()
    delete ProjectSetup.execing.NodeJS
    shell.openPath(ProjectSetup.form.NodeJS.dir)
    show.value = false
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
