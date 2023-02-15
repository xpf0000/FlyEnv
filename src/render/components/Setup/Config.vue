<template>
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
  import { defineComponent } from 'vue'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  const { dialog } = require('@electron/remote')
  export default defineComponent({
    components: {},
    props: {
      typeFlag: {
        type: String,
        default: ''
      }
    },
    data() {
      return {}
    },
    computed: {
      setup() {
        return AppStore().config.setup
      },
      common() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
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

<style lang="scss">
  .setup-config {
    .plant-title {
      padding: 22px 24px;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;

      .add {
        color: #01cc74;
        cursor: pointer;
      }
    }
    .main {
      background: #32364a;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      min-height: 100px;

      .el-form-item--default {
        margin-top: 12px !important;
        margin-bottom: 12px !important;
        justify-content: center;

        .el-form-item__label {
          padding-right: 20px !important;
        }

        .el-form-item__content {
          flex: unset !important;
        }
      }

      .path-choose {
        display: flex;
        align-items: flex-end;
        padding: 8px 0;

        .input {
          flex: 1;
          background: transparent;
          border-top: none;
          border-left: none;
          border-right: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.7);
          outline: none;
          height: 42px;
          color: #fff;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          &::-webkit-input-placeholder {
            color: rgba(255, 255, 255, 0.7);
          }
          &:hover {
            border-bottom: 2px solid rgba(255, 255, 255, 0.7);
          }
          &:focus {
            border-bottom: 2px solid #01cc74;
          }
          &.error {
            border-bottom: 2px solid #cc5441;
          }
        }
        .icon-block {
          margin-left: 15px;
          display: flex;
          align-items: center;

          .choose {
            color: #01cc74;
            margin-left: 20px;
            cursor: pointer;
          }
        }
      }
    }
  }
</style>
