<template>
  <ul ref="fileDroper" class="http-serve-list">
    <template v-if="httpServe.length === 0">
      <li class="empty" @click.stop="choosePath">
        <div class="wapper" :class="{ ondrop: ondrop }">
          <yb-icon :svg="import('@/svg/upload.svg?raw')" class="icon" />
          <span>{{ $t('base.httpServerTips') }}</span>
        </div>
      </li>
    </template>
    <template v-else>
      <li v-for="(item, key) in serves" :key="key" class="http-serve-item">
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
            <yb-icon :svg="import('@/svg/delete.svg?raw')" @click.stop="doDel(key, item)" />
          </div>
        </div>
      </li>
    </template>
  </ul>
</template>

<script lang="ts">
  import { reactive, defineComponent } from 'vue'
  import { AppStore } from '../../store/app'
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@shared/lang'
  const Serves: { [key: string]: any } = reactive({})
  export default defineComponent({
    components: {},
    props: {},
    data() {
      return {
        ondrop: false
      }
    },
    computed: {
      httpServe() {
        return AppStore().httpServe
      },
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
    created: function () {},
    mounted() {
      this.initDroper()
    },
    unmounted() {},
    methods: {
      choosePath() {
        this.addPath('/Users/XXX/Desktop/www/xxxx')
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
        if (this.httpServe.includes(path)) {
          return
        }
        this.httpServe.push(path)
        const item = Serves[path]
        this.doRun(path, item)
      },
      doRun(path: string, item: any) {
        if (!item) {
          return
        }
        item.run = true
        item.host = ['http://localhost:56487', 'http://0.0.0.0:56487']
      },
      doStop(path: string, item: any) {
        item.run = false
        item.host = ''
        item.port = 0
      },
      doDel(path: string) {
        ElMessageBox.confirm(I18nT('base.delAlertContent'), undefined, {
          confirmButtonText: I18nT('base.confirm'),
          cancelButtonText: I18nT('base.cancel'),
          closeOnClickModal: false,
          customClass: 'confirm-del',
          type: 'warning'
        }).then(() => {
          this.httpServe.splice(this.httpServe.indexOf(path), 1)
        })
      },
      doJump() {},
      openDir() {}
    }
  })
</script>
