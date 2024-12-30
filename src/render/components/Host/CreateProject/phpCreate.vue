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
          <div class="h-[263px] overflow-hidden">
            <el-scrollbar>
              <pre class="w-full break-words whitespace-pre-wrap">
                {{ ProjectSetup.log?.PHP?.join('\n') }}
                <div ref="bottom"></div>
              </pre>
            </el-scrollbar>
          </div>
        </template>
        <template v-else>
          <div class="main">
            <div class="path-choose mt-20 mb-20">
              <input
                type="text"
                class="input"
                placeholder="root path"
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
                class="w-32"
                filterable
                :disabled="loading || created"
              >
                <el-option value="" :label="I18nT('host.useSysVersion')"></el-option>
                <template v-for="(v, k) in phpVersions" :key="k">
                  <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
                </template>
              </el-select>
            </div>
            <div class="park">
              <div class="title">
                <span>{{ I18nT('base.composerVersion') }}</span>
              </div>
              <el-select
                v-model="ProjectSetup.form.PHP.composer"
                class="w-32"
                filterable
                :disabled="loading || created"
              >
                <el-option value="" :label="I18nT('host.useSysVersion')"></el-option>
                <template v-for="(v, k) in composerVersions" :key="k">
                  <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
                </template>
              </el-select>
            </div>
            <div class="park">
              <div class="title">
                <span>{{ I18nT('host.frameWork') }}</span>
              </div>
              <el-select
                v-model="ProjectSetup.form.PHP.version"
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
          <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
          <el-button
            :loading="loading"
            :disabled="!createAble"
            type="primary"
            @click="doCreateProject"
            >{{ I18nT('base.confirm') }}</el-button
          >
        </template>
        <template v-else>
          <el-button @click="show = false">{{ I18nT('base.confirm') }}</el-button>
          <el-button type="primary" @click="doCreateHost">{{
            I18nT('host.toCreateHost')
          }}</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import IPC from '@/util/IPC'
  import { I18nT } from '@shared/lang'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { BrewStore } from '@/store/brew'
  import AppVersions from './version'
  import installedVersions from '@/util/InstalledVersions'
  import { ProjectSetup } from '@/components/Host/CreateProject/project'

  const { join } = require('path')
  const { dialog } = require('@electron/remote')
  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    type: keyof typeof AppVersions
  }>()

  const bottom = ref<HTMLElement>()

  const app = computed(() => {
    return AppVersions[props.type]
  })

  const brewStore = BrewStore()
  const created = ref(false)
  const loading = computed({
    get() {
      return ProjectSetup.running?.PHP ?? false
    },
    set(v) {
      ProjectSetup.running.PHP = v
    }
  })
  const createAble = computed(() => {
    return !!ProjectSetup.form.PHP.dir && !!ProjectSetup.form.PHP.version
  })

  const phpVersions = computed(() => {
    return brewStore.module('php').installed
  })

  const composerVersions = computed(() => {
    return brewStore.module('composer').installed
  })

  if (!brewStore.module('php').installedInited) {
    installedVersions.allInstalledVersions(['php']).then().catch()
  }
  if (!brewStore.module('composer').installedInited) {
    installedVersions.allInstalledVersions(['composer']).then().catch()
  }

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

  const doCreateProject = () => {
    loading.value = true
    if (!ProjectSetup.log?.PHP) {
      ProjectSetup.log.PHP = reactive([])
    }
    ProjectSetup.log.PHP.splice(0)
    IPC.send(
      'app-fork:project',
      'createProject',
      ProjectSetup.form.PHP.dir,
      ProjectSetup.form.PHP.php,
      ProjectSetup.form.PHP.composer,
      props.type.toLowerCase(),
      ProjectSetup.form.PHP.version
    ).then((key: string, res: any) => {
      if (res?.code === 0) {
        IPC.off(key)
        MessageSuccess(I18nT('base.success'))
        loading.value = false
        created.value = true
      } else if (res?.code === 1) {
        IPC.off(key)
        if (ProjectSetup.log?.PHP && ProjectSetup.log?.PHP?.length > 0) {
          MessageError(ProjectSetup.log?.PHP.join('\n'))
        } else {
          MessageError(I18nT('base.fail'))
        }
        loading.value = false
      } else {
        if (typeof res?.msg === 'string') {
          ProjectSetup.log?.PHP?.push(res?.msg)
        }
      }
    })
  }

  watch(
    () => ProjectSetup.log?.PHP,
    () => {
      nextTick().then(() => {
        bottom?.value?.scrollIntoView(true)
      })
    },
    {
      deep: true
    }
  )

  onMounted(() => {
    nextTick().then(() => {
      bottom?.value?.scrollIntoView(true)
    })
  })

  const doCreateHost = () => {
    const framework = props.type.toLowerCase()
    let dir = ProjectSetup.form.PHP.dir
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
    callback({
      dir,
      rewrite: nginxRewrite
    })
    show.value = false
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
