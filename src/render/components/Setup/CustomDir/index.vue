<template>
  <el-radio-group v-model="typeFlag" class="custom-dir-tabs">
    <el-radio-button label="nginx">Nginx</el-radio-button>
    <el-radio-button label="apache">Apache</el-radio-button>
    <el-radio-button label="mysql">Mysql</el-radio-button>
    <el-radio-button label="mariadb">MariaDB</el-radio-button>
    <el-radio-button label="php">Php</el-radio-button>
    <el-radio-button label="memcached">Memcached</el-radio-button>
    <el-radio-button label="redis">Redis</el-radio-button>
    <el-radio-button label="mongodb">Mongodb</el-radio-button>
    <el-radio-button label="postgresql">PostgreSql</el-radio-button>
  </el-radio-group>
  <div class="setup-config">
    <div class="plant-title">
      <span>{{ $t('base.customVersionDir') }}</span>
      <yb-icon
        :svg="import('@/svg/add.svg?raw')"
        class="add"
        width="18"
        height="18"
        @click="addDir(undefined)"
      />
    </div>
    <div class="main">
      <template v-for="(item, index) in dirs" :key="index">
        <div class="path-choose mb-20">
          <input type="text" class="input" placeholder="root path" readonly="" :value="item" />
          <div class="icon-block">
            <yb-icon
              :svg="import('@/svg/folder.svg?raw')"
              class="choose"
              width="18"
              height="18"
              @click="chooseDir(index)"
            />
            <yb-icon
              :svg="import('@/svg/delete.svg?raw')"
              class="choose"
              width="19"
              height="19"
              @click="delDir(index)"
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, reactive } from 'vue'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  const { dialog } = require('@electron/remote')
  export default defineComponent({
    components: {},
    props: {},
    data() {
      return {
        typeFlag: 'nginx'
      }
    },
    computed: {
      setup() {
        return AppStore().config.setup
      },
      common() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        if (!this?.setup?.[flag]) {
          this.initDir(flag)
        }
        return this.setup[flag]
      },
      dirs() {
        return this.common.dirs
      }
    },
    watch: {
      dirs: {
        handler() {
          const flag: keyof typeof AppSofts = this.typeFlag as any
          AppStore().saveConfig()
          BrewStore()[flag].installedInited = false
        },
        deep: true
      }
    },
    created: function () {},
    methods: {
      initDir(flag: any) {
        const setup: any = this.setup
        setup[flag] = reactive({ dirs: [] })
      },
      addDir(index: number) {
        let opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
        dialog
          .showOpenDialog({
            properties: opt
          })
          .then(({ canceled, filePaths }: any) => {
            if (canceled || filePaths.length === 0) {
              return
            }
            const [path] = filePaths
            const flag: keyof typeof AppSofts = this.typeFlag as any
            AppStore().SET_CUSTOM_DIR({
              typeFlag: flag,
              dir: path,
              index: index
            })
          })
      },
      chooseDir(index: number) {
        this.addDir(index)
      },
      delDir(index: number) {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        AppStore().DEL_CUSTOM_DIR({
          typeFlag: flag,
          index: index
        })
      }
    }
  })
</script>
