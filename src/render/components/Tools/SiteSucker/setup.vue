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
      <div class="host-edit">
        <div class="nav pl-3 pr-5">
          <div class="left" @click="show = false">
            <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
            <span class="ml-3">{{ $t('base.settings') }}</span>
          </div>
          <el-button type="primary" class="shrink0" @click="doSubmit">{{
            $t('base.confirm')
          }}</el-button>
        </div>
        <el-scrollbar class="flex-1">
          <div class="main-wapper p-3">
            <div class="main p-5">
              <el-form label-position="top" class="site-sucker-setup" @submit.prevent>
                <el-form-item :label="$t('util.savePath')">
                  <div class="path-choose w-full">
                    <input
                      type="text"
                      class="input"
                      :placeholder="$t('util.saveAs')"
                      readonly="true"
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
                <el-form-item :label="$t('tools.windowCount')">
                  <div class="path-choose w-full">
                    <el-slider
                      v-model.number="form.windowCount"
                      :min="1"
                      :max="CPU_Count"
                      show-input
                    ></el-slider>
                  </div>
                </el-form-item>
                <el-form-item :label="$t('util.proxy')">
                  <div class="path-choose w-full">
                    <input
                      v-model.trim="form.proxy"
                      type="text"
                      class="input"
                      placeholder="Example: http://127.0.0.1:1087"
                    />
                  </div>
                </el-form-item>
                <el-form-item :label="$t('util.timeout')">
                  <div class="path-choose w-full">
                    <input
                      v-model.number="form.timeout"
                      type="number"
                      class="input"
                      :placeholder="$t('util.timeoutTips')"
                    />
                  </div>
                </el-form-item>
                <el-form-item :label="$t('util.maxImgSize')">
                  <div class="path-choose w-full">
                    <input
                      v-model.number="form.maxImgSize"
                      type="number"
                      class="input"
                      :placeholder="$t('util.maxImgSize')"
                    />
                    <div class="util-m">M</div>
                  </div>
                </el-form-item>
                <el-form-item :label="$t('util.maxVideoSize')">
                  <div class="path-choose w-full">
                    <input
                      v-model.number="form.maxVideoSize"
                      type="number"
                      class="input"
                      :placeholder="$t('util.maxVideoSize')"
                    />
                    <div class="util-m">M</div>
                  </div>
                </el-form-item>
                <el-form-item :label="$t('util.pageLimit')">
                  <div class="path-choose w-full">
                    <input
                      v-model.trim="form.pageLimit"
                      type="text"
                      class="input"
                      :placeholder="$t('util.pageLimitTips')"
                    />
                  </div>
                </el-form-item>
                <el-form-item :label="$t('util.LinkExclusion')">
                  <textarea
                    v-model.trim="form.excludeLink"
                    type="text"
                    class="input-textarea w-full"
                    :placeholder="$t('util.LinkExclusionTips')"
                  ></textarea>
                </el-form-item>
              </el-form>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </template>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { SiteSuckerStore } from '@/components/Tools/SiteSucker/store'
  import { dialog } from '@/util/NodeFn'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const CPU_Count = 8

  const form = ref({
    dir: '',
    proxy: '',
    excludeLink: '',
    pageLimit: '',
    timeout: undefined,
    maxImgSize: undefined,
    maxVideoSize: undefined,
    windowCount: 1
  })

  const store = SiteSuckerStore()
  store.initSetup().then(() => {
    Object.assign(form.value, store.commonSetup)
  })

  const doSubmit = () => {
    console.log('form.value: ', form.value)
    Object.assign(store.commonSetup, form.value)
    console.log('store.commonSetup: ', store.commonSetup)
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
