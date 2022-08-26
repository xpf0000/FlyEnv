<template>
  <ul ref="fileDroper" class="http-serve-list">
    <template v-if="httpServe.length === 0">
      <li class="empty" @click.stop="choosePath">
        <div class="wapper" :class="{ ondrop: ondrop }">
          <yb-icon :svg="import('../../svg/upload.svg?raw')" class="icon" />
          <span>将文件夹拖到此处,或点击选择文件夹</span>
        </div>
      </li>
    </template>
    <template v-else>
      <li v-for="(item, key) in serves" :key="key" class="http-serve-item">
        <div class="left">
          <div class="title">
            <span class="name"> 路径:</span>
            <span class="url">链接:</span>
          </div>
          <div class="value">
            <span class="name">{{ key }} </span>
            <template v-if="!item.host">
              <span class="url empty">无</span>
            </template>
            <template v-else>
              <span class="url" @click="doJump(item.host)">{{ item.host }} </span>
            </template>
          </div>
        </div>
        <div class="right">
          <div v-if="item.run" class="status running">
            <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="doStop(key, item)" />
          </div>
          <div v-else class="status">
            <yb-icon :svg="import('@/svg/play.svg?raw')" @click.stop="doRun(key, item)" />
          </div>
          <div class="del">
            <yb-icon :svg="import('@/svg/delete.svg?raw')" @click.stop="doDel(key, item)" />
          </div>
        </div>
      </li>
    </template>
  </ul>
</template>

<script>
  import { reactive } from 'vue'
  import { mapGetters } from 'vuex'
  import IPC from '@/util/IPC.js'
  import { handleHost } from '@/util/Host.js'
  const { dialog, shell } = require('@electron/remote')
  const { pathExistsSync, statSync } = require('fs-extra')
  const Serves = reactive({})
  export default {
    components: {},
    props: {},
    data() {
      return {
        ondrop: false
      }
    },
    computed: {
      ...mapGetters('app', {
        httpServe: 'httpServe'
      }),
      serves() {
        for (const serve of this.httpServe) {
          if (!Serves[serve]) {
            Serves[serve] = {
              run: false,
              port: 0,
              host: ''
            }
          }
        }
        for (const key in Serves) {
          if (!this.httpServe.includes(key)) {
            delete Serves[key]
          }
        }
        return Serves
      }
    },
    watch: {},
    created: function () {
      console.log('this.hosts: ', this.hosts)
    },
    mounted() {
      this.initDroper()
    },
    unmounted() {},
    methods: {
      choosePath() {
        let opt = ['openDirectory']
        dialog
          .showOpenDialog({
            properties: opt
          })
          .then(({ canceled, filePaths }) => {
            if (canceled || filePaths.length === 0) {
              return
            }
            const path = filePaths[0]
            this.addPath(path)
          })
      },
      initDroper() {
        let selecter = this.$refs.fileDroper
        selecter.addEventListener('drop', (e) => {
          e.preventDefault()
          e.stopPropagation()
          // 获得拖拽的文件集合
          let files = e.dataTransfer.files
          const path = [...files].map((file) => {
            return file.path
          })[0]
          this.addPath(path)
          this.ondrop = false
        })
        selecter.addEventListener('dragover', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })

        selecter.addEventListener(
          'dragenter',
          (e) => {
            this.dropNode = e.target
            this.ondrop = true
          },
          false
        )
        selecter.addEventListener(
          'dragleave',
          (e) => {
            if (e.target === this.dropNode) {
              this.ondrop = false
            }
          },
          false
        )
      },
      addPath(path) {
        if (!pathExistsSync(path)) return
        const stat = statSync(path)
        if (!stat.isDirectory()) {
          this.$message.error('请选择文件夹!')
          return
        }
        if (this.httpServe.includes(path)) {
          return
        }
        this.httpServe.push(path)
        this.$store.dispatch('app/saveConfig').then()
      },
      doRun(path, item) {
        IPC.send('app-http-serve-run', path).then((key, info) => {
          IPC.off(key)
          console.log(info)
          if (info?.path && info.path === path) {
            item.run = true
            item.host = info.host
            item.port = info.port
          }
        })
      },
      doStop(path, item) {
        IPC.send('app-http-serve-stop', path).then((key, info) => {
          IPC.off(key)
          if (info?.path && info.path === path) {
            item.run = false
            item.host = ''
            item.port = 0
          }
        })
      },
      doDel(path) {
        this.$baseConfirm('确认删除?', null, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            IPC.send('app-http-serve-stop', path).then((key) => {
              IPC.off(key)
            })
            this.httpServe.splice(this.httpServe.indexOf(path), 1)
            this.$store.dispatch('app/saveConfig').then()
          })
          .catch(() => {})
      },
      doJump(host) {
        shell.openExternal(host)
      }
    }
  }
</script>

<style lang="scss">
  .confirm-del {
    background: #32364a !important;
    border: 1px solid #32364a !important;
    color: #fff !important;
    .el-message-box__message,
    .el-message-box__close {
      color: rgba(255, 255, 255, 0.7) !important;
    }
  }
  .http-serve-list {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: auto;

    .http-serve-item {
      flex-shrink: 0;
      display: flex;
      justify-content: space-between;
      padding: 0 40px;
      align-items: center;
      width: 100%;
      height: 120px;
      background: #32364a;
      border-radius: 8px;
      margin-bottom: 20px;

      .left {
        height: 100%;
        flex: 1;
        display: flex;
        padding-right: 40px;
        font-size: 15px;
        overflow: hidden;

        > .title {
          flex-shrink: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding-right: 20px;
          .url {
            margin-top: 10px;
          }
        }

        > .value {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding-right: 20px;
          overflow: hidden;

          .url {
            margin-top: 10px;
            color: #409eff;
            cursor: pointer;

            &.empty {
              color: #fff;
              cursor: unset;
            }
          }
        }

        span {
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
      }
      .right {
        flex-shrink: 0;
        display: flex;
        align-items: center;

        > div {
          display: flex;
          align-items: center;
          justify-content: center;

          &.running {
            svg {
              color: #01cc74;
            }
          }
        }

        svg {
          width: 22px;
          height: 22px;
          cursor: pointer;

          &:hover {
            color: #fdab1f;
          }
        }

        .del {
          margin-left: 30px;
        }
      }
    }

    > .empty {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;

      > .wapper {
        width: 70%;
        height: 70%;
        border: 2px dashed #ccc;
        border-radius: 10px;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        cursor: pointer;
        color: #fff;
        .icon {
          width: 100px;
          height: 100px;
          margin-bottom: 20px;
        }

        &.ondrop {
          border: 2px dashed #fdab1f;
          color: #fdab1f;

          .icon {
            color: #fdab1f;
          }
        }
      }
    }
  }
</style>
