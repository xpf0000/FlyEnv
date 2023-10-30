<template>
  <el-drawer
    v-model="show"
    :title="null"
    :with-header="false"
    size="460px"
    :destroy-on-close="true"
    @closed="closedFn"
  >
    <template #default>
      <div class="ssl-make">
        <div class="nav">
          <div class="left" @click="show = false">
            <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
            <span class="ml-15">{{ $t('util.setup') }}</span>
          </div>
          <el-button type="primary" class="shrink0" @click="doSubmit">{{
            $t('base.confirm')
          }}</el-button>
        </div>
        <div class="main-wapper">
          <div class="main">
            <el-form label-position="top" class="site-sucker-setup" @submit.prevent>
              <el-form-item label="保存路径">
                <div class="path-choose w-p100">
                  <input
                    type="text"
                    class="input"
                    placeholder="文件保存为 保存路径/域名"
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
              </el-form-item>
              <el-form-item label="网络代理">
                <div class="path-choose w-p100">
                  <input
                    type="text"
                    class="input"
                    placeholder="eg: http://127.0.0.1:1087"
                    :value="form.proxy"
                  />
                </div>
              </el-form-item>
              <el-form-item label="页面限制">
                <div class="path-choose w-p100">
                  <input
                    type="text"
                    class="input"
                    placeholder="限制页面地址必须包含此处字符串"
                    :value="form.dir"
                  />
                </div>
              </el-form-item>
              <el-form-item label="链接排除">
                <textarea
                  v-model.trim="form.excludeLink"
                  type="text"
                  class="input-textarea w-p100"
                  placeholder="过滤包含此处字符串的网址, 每行一个"
                ></textarea>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </div>
    </template>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { SiteSuckerStore } from '@/components/Tools/SiteSucker/store'

  const { dialog } = require('@electron/remote')
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const form = ref({
    dir: '',
    proxy: '',
    excludeLink: '',
    pageLimit: ''
  })

  const store = SiteSuckerStore()
  store.initSetup().then(() => {
    Object.assign(form.value, store.commonSetup)
  })

  const doSubmit = () => {
    Object.assign(store.commonSetup, form.value)
    store.save()
    show.value = false
  }

  const chooseRoot = () => {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        form.value.dir = path
      })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
<style lang="scss">
  .site-sucker-setup {
    > .el-form-item {
      margin-bottom: 30px;
    }
    textarea {
      margin-top: 10px !important;
    }
  }
</style>
