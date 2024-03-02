<template>
  <div class="host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">Php Obfuscator</span>
      </div>
      <el-button type="primary" class="shrink0" :loading="running" @click="doSave">{{
        $t('base.generate')
      }}</el-button>
    </div>

    <div class="main-wapper">
      <div class="main">
        <div class="path-choose mt-20 mb-20">
          <el-select
            v-model="item.phpversion"
            class="w-p100"
            :class="'input' + (errs['phpversion'] ? ' error' : '')"
            :placeholder="$t('php.obfuscatorPhpVersion')"
          >
            <template v-for="(item, index) in phpVersions" :key="index">
              <el-option :value="item.path + '-' + item.version" :label="item.version"></el-option>
            </template>
          </el-select>
        </div>
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="'input' + (errs['src'] ? ' error' : '')"
            readonly="readonly"
            :placeholder="$t('php.obfuscatorSrc')"
            :value="item.src"
          />
          <div class="icon-block" @click="chooseSrc">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="{
              input: true,
              error: errs['desc'],
              enable: descType !== ''
            }"
            readonly="readonly"
            :placeholder="$t('php.obfuscatorDesc')"
            :value="item.desc"
          />
          <div
            :class="{
              enable: descType !== ''
            }"
            class="icon-block"
            @click="chooseDesc"
          >
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
        <div class="path-choose mt-20 mb-20">
          <el-button @click="showConfig = true">{{ $t('php.obfuscatorConfig') }}</el-button>
        </div>
      </div>
    </div>
  </div>
  <el-drawer
    ref="host-edit-drawer"
    v-model="showConfig"
    size="75%"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :with-header="false"
  >
    <Config :custom-config="item.config" @doClose="configCallBack"></Config>
  </el-drawer>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import { BrewStore } from '../../../store/brew'
  import Config from './Config.vue'
  import { waitTime } from '../../../fn'

  let running = ref(false)

  export default defineComponent({
    components: { Config },
    props: {},
    emits: ['doClose'],
    data() {
      return {
        descType: '',
        showConfig: false,
        item: {
          phpversion: '',
          src: '',
          desc: '',
          config: ''
        },
        edit: {},
        errs: {
          phpversion: false,
          src: false,
          desc: false
        }
      }
    },
    computed: {
      running() {
        return running.value
      },
      phpVersions() {
        return BrewStore().php.installed.filter((p) => p.enable && p.num && p?.num > 56)
      }
    },
    watch: {
      item: {
        handler() {
          const errs: { [key: string]: boolean } = this.errs
          for (let k in errs) {
            errs[k] = false
          }
        },
        immediate: true,
        deep: true
      }
    },
    created: function () {},
    mounted() {},
    unmounted() {},
    methods: {
      configCallBack(config?: string) {
        if (typeof config === 'string') {
          this.item.config = config
        }
        this.showConfig = false
      },
      doSave() {
        if (!this.checkItem() || this.running) {
          return
        }
        running.value = true
        waitTime().then(() => {
          this.$message.success(this.$t('base.success'))
          running.value = false
        })
      },
      checkItem() {
        this.errs.phpversion = this.item.phpversion.length === 0
        this.errs.src = this.item.src.length === 0
        this.errs.desc =
          this.item.desc.length === 0 ||
          this.item.src === this.item.desc ||
          this.item.desc.includes(this.item.src)
        const errs: { [key: string]: boolean } = this.errs
        for (let k in errs) {
          if (errs[k]) {
            return false
          }
        }
        return true
      },
      chooseSrc() {},
      chooseDesc() {},
      doClose() {
        this.$emit('doClose')
      }
    }
  })
</script>
