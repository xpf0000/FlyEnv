<template>
  <el-dialog
    v-model="show"
    :title="$t('host.newProject')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <div class="main">
          <div class="path-choose mt-20 mb-20">
            <input
              type="text"
              class="input"
              placeholder="root path"
              readonly=""
              :value="form.dir"
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
              <span>{{ $t('host.frameWork') }}</span>
            </div>
            <el-select v-model="form.framework" filterable :disabled="loading || created">
              <template v-for="(v, k) in Versions" :key="k">
                <el-option-group :label="k">
                  <template v-for="(item, i) in v" :key="i">
                    <el-option :value="`${k}-${item.version}`" :label="item.name"></el-option>
                  </template>
                </el-option-group>
              </template>
            </el-select>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <template v-if="!created">
          <el-button @click="show = false">{{ $t('base.cancel') }}</el-button>
          <el-button
            :loading="loading"
            :disabled="!createAble"
            type="primary"
            @click="doCreateProject"
            >{{ $t('base.confirm') }}</el-button
          >
        </template>
        <template v-else>
          <el-button @click="show = false">{{ $t('base.confirm') }}</el-button>
          <el-button type="primary" @click="doCreateHost">{{ $t('host.toCreateHost') }}</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AsyncComponentSetup, waitTime } from '../../../fn'
  import Versions from './version'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const form = ref({
    dir: '',
    framework: 'wordpress-*'
  })

  const created = ref(false)
  const loading = ref(false)
  const createAble = computed(() => {
    return !!form.value.dir && !!form.value.framework
  })

  const chooseRoot = () => {
    if (loading.value || created.value) {
      return
    }
    form.value.dir = '/Users/XXX/Desktop/WWW/xxxx/'
  }
  const doCreateProject = () => {
    console.log('doCreateProject: ', form.value)
    loading.value = true
    waitTime().then(() => {
      ElMessage.success(I18nT('base.success'))
      loading.value = false
      created.value = true
    })
  }
  const doCreateHost = () => {
    const framework = form.value.framework
    let dir = form.value.dir
    let nginxRewrite = ''
    if (framework.includes('wordpress')) {
      dir = form.value.dir + 'wordpress'
      nginxRewrite = `location /
{
\t try_files $uri $uri/ /index.php?$args;
}

rewrite /wp-admin$ $scheme://$host$uri/ permanent;`
    } else if (framework.includes('laravel')) {
      dir = form.value.dir + 'public'
      nginxRewrite = `location / {
\ttry_files $uri $uri/ /index.php$is_args$query_string;
}`
    } else if (framework.includes('yii2')) {
      dir = form.value.dir + 'web'
      nginxRewrite = `location / {
    try_files $uri $uri/ /index.php?$args;
}`
    } else if (framework.includes('thinkphp')) {
      dir = form.value.dir + 'public'
      nginxRewrite = `location / {
\tif (!-e $request_filename){
\t\trewrite  ^(.*)$  /index.php?s=$1  last;   break;
\t}
}`
    } else if (framework.includes('symfony')) {
      dir = form.value.dir + 'public'
      nginxRewrite = `location / {
        try_files $uri /index.php$is_args$args;
}`
    } else if (framework.includes('cakephp')) {
      dir = form.value.dir + 'webroot'
      nginxRewrite = `location / {
    try_files $uri $uri/ /index.php?$args;
}`
    } else if (framework.includes('slim')) {
      dir = form.value.dir + 'public'
      nginxRewrite = `location / {
        try_files $uri /index.php$is_args$args;
}`
    } else if (framework.includes('codeIgniter')) {
      dir = form.value.dir + 'public'
      nginxRewrite = `location / {
        try_files $uri $uri/ /index.php$is_args$args;
}`
    }
    callback({
      dir,
      rewrite: nginxRewrite
    })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
