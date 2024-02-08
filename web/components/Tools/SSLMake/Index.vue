<template>
  <div class="host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
        <span class="ml-15">SSL Make</span>
      </div>
      <el-button type="primary" class="shrink0" :loading="running" @click="doSave">{{
        $t('base.generate')
      }}</el-button>
    </div>

    <div class="main-wapper">
      <div class="main">
        <textarea
          v-model.trim="item.domains"
          type="text"
          :class="'input-textarea' + (errs['domains'] ? ' error' : '')"
          placeholder="domains eg: *.xxx.com, One domain name per line"
        ></textarea>
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="'input' + (errs['root'] ? ' error' : '')"
            readonly="readonly"
            placeholder="Root CA certificate path, if not choose, will create new in SSL certificate save path"
            :value="item.root"
          />
          <div class="icon-block" @click="chooseRoot('root', true)">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="'input' + (errs['savePath'] ? ' error' : '')"
            readonly="readonly"
            placeholder="SSL certificate save path"
            :value="item.savePath"
          />
          <div class="icon-block" @click="chooseRoot('save')">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { waitTime } from '../../../fn.ts'

  export default {
    components: {},
    props: {},
    data() {
      return {
        running: false,
        item: {
          domains: '',
          root: '',
          savePath: ''
        },
        edit: {},
        errs: {
          domains: false,
          root: false,
          savePath: false
        }
      }
    },
    computed: {},
    watch: {
      item: {
        handler() {
          for (let k in this.errs) {
            this.errs[k] = false
          }
        },
        immediate: true,
        deep: true
      }
    },
    created: function () {},
    unmounted() {},
    methods: {
      doClose() {
        this.$emit('doClose')
      },
      chooseRoot() {},
      checkItem() {
        this.errs.domains = this.item.domains.length === 0
        this.errs.savePath = this.item.savePath.length === 0

        for (let k in this.errs) {
          if (this.errs[k]) {
            return false
          }
        }
        return true
      },
      doSave() {
        if (!this.checkItem()) {
          return
        }
        this.running = true
        waitTime().then(() => {
          ElMessage.success(I18nT('base.success'))
          this.doClose()
        })
      }
    }
  }
</script>
