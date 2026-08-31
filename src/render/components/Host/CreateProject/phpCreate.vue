<template>
  <el-dialog
    v-model="show"
    :title="type"
    width="600px"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    class="host-edit new-project"
    :class="{
      installing: loading
    }"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper h-full">
        <template v-if="showTerminal">
          <div ref="xterm" class="h-full overflow-hidden"> </div>
        </template>
        <template v-else>
          <div class="main p-5">
            <div class="path-choose my-5">
              <input
                type="text"
                class="input"
                placeholder="Document Root Directory"
                :readonly="loading || created ? true : undefined"
                :value="ProjectSetup.form.PHP.dir"
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
                <span>{{ I18nT('base.phpVersion') }}</span>
              </div>
              <el-select
                v-model="ProjectSetup.form.PHP.php"
                class="w-56 max-w-56"
                filterable
                :disabled="loading || created"
              >
                <el-option value="" :label="I18nT('host.useSysVersion')"></el-option>
                <template v-for="(v, _k) in phpVersions" :key="_k">
                  <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
                </template>
              </el-select>
            </div>
            <div class="park">
              <div class="title">
                <span>{{ I18nT('host.composerVersion') }}</span>
              </div>
              <el-select
                v-model="ProjectSetup.form.PHP.composer"
                class="w-56 max-w-56"
                filterable
                :disabled="loading || created"
              >
                <el-option value="" :label="I18nT('host.useSysVersion')"></el-option>
                <template v-for="(v, _k) in composerVersions" :key="_k">
                  <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
                </template>
              </el-select>
            </div>
            <div class="park">
              <div class="title">
                <span>{{ I18nT('host.frameworkVersion') }}</span>
              </div>
              <el-select
                v-model="ProjectSetup.form.PHP.version"
                class="w-56 max-w-56"
                filterable
                :disabled="loading || created"
              >
                <template v-for="(v, _k) in app.list" :key="_k">
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
          <el-button @click="doCancel">{{ I18nT('base.confirm') }}</el-button>
          <el-button type="primary" @click="doCreateHost">{{
            I18nT('host.toCreateHost')
          }}</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import { BrewStore } from '@/store/brew'
  import AppVersions from './version'
  import { ProjectSetup } from '@/components/Host/CreateProject/project'
  import { join } from '@/util/path-browserify'
  import { dialog } from '@/util/NodeFn'
  import phpProjectCreateController, {
    type PhpProjectCreateRequest
  } from './PhpProjectCreateController'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    type: keyof typeof AppVersions
  }>()

  const xterm = ref<HTMLElement>()

  const app = computed(() => {
    return AppVersions[props.type]
  })

  const brewStore = BrewStore()
  const terminalVisible = ref(false)
  const starting = ref(false)
  const loading = computed(() => phpProjectCreateController.running || starting.value)
  const created = computed(() => phpProjectCreateController.created)
  const showTerminal = computed(
    () =>
      terminalVisible.value ||
      phpProjectCreateController.running ||
      phpProjectCreateController.created ||
      phpProjectCreateController.failed
  )

  const createAble = computed(() => {
    return !!ProjectSetup.form.PHP.dir && !!ProjectSetup.form.PHP.version
  })

  const phpVersions = computed(() => {
    return brewStore.module('php').installed.map((i) => {
      return {
        bin: i?.phpBin ?? join(i.path, 'bin/php'),
        version: i.version
      }
    })
  })

  const composerVersions = computed(() => {
    return brewStore.module('composer').installed
  })

  brewStore.module('php').fetchInstalled().catch()
  brewStore.module('composer').fetchInstalled().catch()

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
        ProjectSetup.form.PHP.dir = path
      })
  }

  const createRequest = (): PhpProjectCreateRequest => {
    const form = ProjectSetup.form.PHP
    return {
      dir: form.dir,
      php: form.php,
      composer: form.composer,
      version: form.version,
      package: app.value.package,
      framework: props.type.toLowerCase(),
      isWordPress: props.type === 'WordPress',
      proxy: Object.fromEntries(
        Object.entries(window.Server.Proxy ?? {}).map(([key, value]) => [key, `${value}`])
      ),
      isWindows: false
    }
  }

  const doCreateProject = async () => {
    if (loading.value) {
      return
    }
    terminalVisible.value = true
    starting.value = true
    await nextTick()
    try {
      if (show.value && xterm.value) {
        await phpProjectCreateController.start(createRequest(), xterm.value)
      }
    } finally {
      starting.value = false
    }
  }

  const doCancel = () => {
    show.value = false
    phpProjectCreateController.reset()
    ProjectSetup.phpFormInit()
    terminalVisible.value = false
  }

  const doStop = async () => {
    if (!loading.value) {
      doCancel()
      return
    }
    await phpProjectCreateController.stop()
    phpProjectCreateController.reset()
    ProjectSetup.phpFormInit()
    terminalVisible.value = false
    show.value = false
  }

  const doCreateHost = () => {
    const framework = props.type.toLowerCase()
    const projectDir = ProjectSetup.form.PHP.dir
    let dir = projectDir
    let nginxRewrite = ''
    if (framework.includes('wordpress')) {
      dir = join(ProjectSetup.form.PHP.dir, 'wordpress')
      nginxRewrite = `location /
{
\t try_files $uri $uri/ /index.php?$args;
}

rewrite /wp-admin$ $scheme://$host$uri/ permanent;`
    } else if (framework.includes('laravel')) {
      dir = join(ProjectSetup.form.PHP.dir, 'public')
      nginxRewrite = `location / {
\ttry_files $uri $uri/ /index.php$is_args$query_string;
}`
    } else if (framework.includes('yii2')) {
      dir = join(ProjectSetup.form.PHP.dir, 'web')
      nginxRewrite = `location / {
    try_files $uri $uri/ /index.php?$args;
}`
    } else if (framework.includes('thinkphp')) {
      dir = join(ProjectSetup.form.PHP.dir, 'public')
      nginxRewrite = `location / {
\tif (!-e $request_filename){
\t\trewrite  ^(.*)$  /index.php?s=$1  last;   break;
\t}
}`
    } else if (framework.includes('symfony')) {
      dir = join(ProjectSetup.form.PHP.dir, 'public')
      nginxRewrite = `location / {
        try_files $uri /index.php$is_args$args;
}`
    } else if (framework.includes('cakephp')) {
      dir = join(ProjectSetup.form.PHP.dir, 'webroot')
      nginxRewrite = `location / {
    try_files $uri $uri/ /index.php?$args;
}`
    } else if (framework.includes('slim')) {
      dir = join(ProjectSetup.form.PHP.dir, 'public')
      nginxRewrite = `location / {
        try_files $uri /index.php$is_args$args;
}`
    } else if (framework.includes('codeIgniter')) {
      dir = join(ProjectSetup.form.PHP.dir, 'public')
      nginxRewrite = `location / {
        try_files $uri $uri/ /index.php$is_args$args;
}`
    }
    show.value = false
    phpProjectCreateController.reset()
    ProjectSetup.phpFormInit()
    terminalVisible.value = false
    nextTick().then(() => {
      callback({
        dir,
        rewrite: nginxRewrite
      })
    })
  }

  onMounted(async () => {
    if (phpProjectCreateController.running) {
      terminalVisible.value = true
      await nextTick()
      if (xterm.value) {
        await phpProjectCreateController.attach(xterm.value)
      }
    }
  })

  onBeforeUnmount(() => {
    phpProjectCreateController.detach()
    if (!phpProjectCreateController.running) {
      phpProjectCreateController.reset()
      terminalVisible.value = false
    }
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
