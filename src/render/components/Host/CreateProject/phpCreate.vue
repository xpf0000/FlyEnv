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
                class="w-32"
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
                class="w-32"
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
                <span>{{ I18nT('host.frameWork') }}</span>
              </div>
              <el-select
                v-model="ProjectSetup.form.PHP.version"
                class="w-32"
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
  import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@shared/lang'
  import { BrewStore } from '@/store/brew'
  import AppVersions from './version'
  import installedVersions from '@/util/InstalledVersions'
  import { ProjectSetup } from '@/components/Host/CreateProject/project'
  import XTerm from '@/util/XTerm'

  const { writeFile } = require('fs-extra')
  const { join } = require('path')
  const { dialog } = require('@electron/remote')
  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    type: keyof typeof AppVersions
  }>()

  const xterm = ref<HTMLElement>()

  const app = computed(() => {
    return AppVersions[props.type]
  })

  const brewStore = BrewStore()
  const loading = computed({
    get() {
      return ProjectSetup.form.PHP.running
    },
    set(v) {
      ProjectSetup.form.PHP.running = v
    }
  })

  const created = computed({
    get() {
      return ProjectSetup.form.PHP.created
    },
    set(v) {
      ProjectSetup.form.PHP.created = v
    }
  })

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

  const doCreateProject = async () => {
    if (loading.value) {
      return
    }
    loading.value = true
    const form = ProjectSetup.form.PHP
    const execXTerm = new XTerm()
    const command: string[] = []
    if (global.Server.Proxy) {
      for (const k in global.Server.Proxy) {
        const v = global.Server.Proxy[k]
        command.push(`export ${k}="${v}"`)
      }
    }
    command.push(`cd "${form.dir}"`)

    if (props.type === 'WordPress') {
      const tmpl = `{
  "require": {
    "johnpbloch/wordpress": "${form.version}"
  },
  "config": {
    "allow-plugins": {
      "johnpbloch/wordpress-core-installer": true
    }
  }
}
`
      await writeFile(join(form.dir, 'composer.json'), tmpl)

      if (form.php && form.composer) {
        command.push(`"${form.php}" "${form.composer}" self-update`)
        command.push(`"${form.php}" "${form.composer}" update`)
      } else if (form.php) {
        command.push(`"${form.php}" composer self-update`)
        command.push(`"${form.php}" composer update`)
      } else if (form.composer) {
        command.push(`php "${form.composer}" self-update`)
        command.push(`php "${form.composer}" update`)
      } else {
        command.push(`php composer self-update`)
        command.push(`php composer update`)
      }
    } else {
      const name = app.value.package
      if (form.php && form.composer) {
        command.push(`"${form.php}" "${form.composer}" self-update`)
        command.push(
          `"${form.php}" "${form.composer}" create-project --prefer-dist "${name}" "phpwebstudy-create-project" "${form.version}"`
        )
      } else if (form.php) {
        command.push(`"${form.php}" composer self-update`)
        command.push(
          `"${form.php}" composer create-project --prefer-dist "${name}" "phpwebstudy-create-project" "${form.version}"`
        )
      } else if (form.composer) {
        command.push(`php "${form.composer}" self-update`)
        command.push(
          `php "${form.composer}" create-project --prefer-dist "${name}" "phpwebstudy-create-project" "${form.version}"`
        )
      } else {
        command.push(`php composer self-update`)
        command.push(
          `php composer create-project --prefer-dist "${name}" "phpwebstudy-create-project" "${form.version}"`
        )
      }
      command.push(`cd phpwebstudy-create-project`)
      command.push(`mv ./* ../`)
      command.push(`cd ../`)
      command.push(`rm -rf phpwebstudy-create-project`)
    }

    nextTick().then(() => {
      execXTerm.mount(xterm.value!).then(() => {
        execXTerm?.send(command)?.then(() => {
          created.value = true
        })
      })
    })
    ProjectSetup.execing.PHP = markRaw(execXTerm)
  }

  const doCancel = () => {
    show.value = false
    ProjectSetup.phpFormInit()
  }

  const doStop = () => {
    if (!loading.value) {
      show.value = false
      return
    }
    const execXTerm = ProjectSetup.execing.PHP
    execXTerm?.stop()?.then(() => {
      execXTerm?.destory()
      created.value = false
      loading.value = false
      delete ProjectSetup.execing.PHP
    })
  }

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
    show.value = false
    ProjectSetup.phpFormInit()
    nextTick().then(() => {
      callback({
        dir,
        rewrite: nginxRewrite
      })
    })
  }

  onMounted(() => {
    if (loading.value) {
      nextTick().then(() => {
        const execXTerm = ProjectSetup.execing.PHP
        if (execXTerm && xterm.value) {
          execXTerm.mount(xterm.value)
        }
      })
    }
  })

  onBeforeUnmount(() => {
    const execXTerm = ProjectSetup.execing.PHP
    execXTerm?.unmounted()
    if (created.value) {
      execXTerm?.destory()
      created.value = false
      loading.value = false
      delete ProjectSetup.execing.PHP
    }
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
