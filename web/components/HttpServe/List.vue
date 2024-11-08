<template>
  <ul ref="fileDroper" class="http-serve-list">
    <template v-if="httpServe.length === 0">
      <li class="empty" @click.stop="choosePath">
        <div class="wapper" :class="{ ondrop: ondrop }">
          <yb-icon :svg="import('../../svg/upload.svg?raw')" class="icon" />
          <span>{{ $t('base.httpServerTips') }}</span>
        </div>
      </li>
    </template>
    <template v-else>
      <li v-for="(item, key) in service" :key="key" class="http-serve-item">
        <div class="left">
          <div class="top">
            <span class="name"> {{ $t('base.path') }}:</span>
            <span class="value" @click.stop="openDir(key)">{{ key }} </span>
          </div>
          <div class="bottom">
            <span class="name">{{ $t('base.link') }}:</span>
            <template v-if="!item.host">
              <span class="url empty">{{ $t('base.none') }}</span>
            </template>
            <template v-else>
              <template v-for="(url, index) in item.host" :key="index">
                <span class="url" @click="doJump(url)">{{ url }} </span>
              </template>
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
            <yb-icon :svg="import('@/svg/delete.svg?raw')" @click.stop="doDel(key)" />
          </div>
        </div>
      </li>
    </template>
  </ul>
</template>

<script lang="ts">
  import { defineComponent, reactive } from 'vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@web/store/app'
  import { MessageError } from '@/util/Element'
  const { dialog, shell } = require('@electron/remote')
  const { pathExistsSync, statSync } = require('fs-extra')
  export default defineComponent({
    components: {},
    props: {},
    data() {
      return {
        ondrop: false
      }
    },
    computed: {
      service() {
        return AppStore().httpServeService
      },
      httpServe() {
        return AppStore().httpServe
      }
    },
    watch: {
      httpServe: {
        handler(arr: Array<string>) {
          for (const a of arr) {
            if (!this.service[a]) {
              this.service[a] = reactive({
                run: false,
                port: 0,
                host: []
              })
            }
          }
          console.log('this.service: ', this.service)
          const keys = Object.keys(this.service)
          for (const k of keys) {
            if (!arr.includes(k)) {
              const item = this.service[k]
              this.doStop(k, item)
              delete this.service[k]
            }
          }
        },
        immediate: true,
        deep: true
      }
    },
    created: function () {},
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
          .then(({ canceled, filePaths }: any) => {
            if (canceled || filePaths.length === 0) {
              return
            }
            const path = filePaths[0]
            this.addPath(path)
          })
      },
      initDroper() {
        let selecter: HTMLElement = this.$refs.fileDroper as HTMLElement
        selecter.addEventListener('drop', (e: any) => {
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
      addPath(path: string) {
        if (!pathExistsSync(path)) return
        const stat = statSync(path)
        if (!stat.isDirectory()) {
          MessageError(this.$t('base.needSelectDir'))
          return
        }
        if (this.httpServe.includes(path)) {
          return
        }
        this.httpServe.push(path)
        AppStore().saveConfig()
        this.$nextTick().then(() => {
          let item = this.service[path]
          if (!item) {
            item = reactive({
              run: false,
              port: 0,
              host: []
            })
            this.service[path] = item
          }
          console.log(item)
          this.doRun(path, item)
        })
      },
      doRun(path: string, item: any) {
        IPC.send('app-http-serve-run', path).then((key: string, info: any) => {
          IPC.off(key)
          console.log(info)
          if (info?.path && info.path === path) {
            item.run = true
            item.host = info.host
            item.port = info.port
          }
        })
      },
      doStop(path: string, item: any) {
        IPC.send('app-http-serve-stop', path).then((key: string, info: any) => {
          IPC.off(key)
          if (info?.path && info.path === path) {
            item.run = false
            item.host = ''
            item.port = 0
          }
        })
      },
      doDel(path: string) {
        this.$baseConfirm(this.$t('base.delAlertContent'), undefined, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            const store = AppStore()
            IPC.send('app-http-serve-stop', path).then((key: string) => {
              IPC.off(key)
            })
            const index = this.httpServe.indexOf(path)
            if (index >= 0) {
              store.httpServe.splice(this.httpServe.indexOf(path), 1)
              store.saveConfig()
            }
          })
          .catch(() => {})
      },
      doJump(host: string) {
        shell.openExternal(host)
      },
      openDir(dir: string) {
        shell.openPath(dir)
      }
    }
  })
</script>
