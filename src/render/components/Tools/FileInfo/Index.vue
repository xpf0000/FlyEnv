<template>
  <div class="host-edit tools tools-file-info">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolFileInfo') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div id="FileInfoDroper" class="main-wapper">
      <div class="select-dir-wapper">
        <div id="selectDir" @click.stop="choosePath">
          <yb-icon :svg="import('@/svg/upload.svg?raw')" class="icon" />
          <span>{{ $t('base.fileInfoTips') }}</span>
        </div>
      </div>
      <ul v-if="path" class="info-wapper">
        <li>
          <span>file size: </span>
          <span v-text="info.size_str"></span>
          <span v-text="info.size"></span>
        </li>
        <li>
          <span>create time: </span>
          <span v-text="info.btime_str"></span>
          <span v-text="info.btime"></span>
        </li>
        <li>
          <span>change time: </span>
          <span v-text="info.ctime_str"></span>
          <span v-text="info.ctime"></span>
        </li>
        <li>
          <span>access time: </span>
          <span v-text="info.atime_str"></span>
          <span v-text="info.atime"></span>
        </li>
        <li>
          <span>modify time: </span>
          <span v-text="info.mtime_str"></span>
          <span v-text="info.mtime"></span>
        </li>
        <li>
          <span>MD5: </span>
          <span v-text="info.md5"></span>
        </li>
        <li>
          <span>SHA-1: </span>
          <span v-text="info.sha1"></span>
        </li>
        <li>
          <span>SHA-256: </span>
          <span v-text="info.sha256"></span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
  import { formatBytes } from '@shared/utils.ts'
  import moment from 'moment'

  const { exec } = require('child-process-promise')
  const { stat } = require('fs')
  const { dialog } = require('@electron/remote')

  export default {
    name: 'MoToolsFileInfo',
    components: {},
    props: {},
    data() {
      return {
        path: '',
        info: {
          size_str: '',
          size: 0,
          atime_str: '',
          atime: 0,
          mtime_str: '',
          mtime: 0,
          ctime_str: '',
          ctime: 0,
          btime_str: '',
          btime: 0,
          md5: '',
          sha1: '',
          sha256: ''
        }
      }
    },
    computed: {},
    watch: {
      path(val) {
        console.log('path: ', val)
        this.getInfo()
      }
    },
    mounted() {
      let selecter = document.getElementById('FileInfoDroper')
      selecter.addEventListener('drop', (e) => {
        e.preventDefault()
        e.stopPropagation()
        // 获得拖拽的文件集合
        let files = e.dataTransfer.files
        this.path = files[0].path
      })
      selecter.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
    },
    created: function () {},
    unmounted() {},
    methods: {
      doClose() {
        this.$emit('doClose')
      },
      choosePath() {
        let opt = ['openFile']
        dialog
          .showOpenDialog({
            properties: opt
          })
          .then(({ canceled, filePaths }) => {
            if (canceled || filePaths.length === 0) {
              return
            }
            const [path] = filePaths
            this.path = path
          })
      },
      getInfo() {
        stat(this.path, (err, stats) => {
          console.log(err)
          console.log(stats)
          if (!err) {
            this.info.size = stats.size
            this.info.size_str = formatBytes(stats.size)
            this.info.atime = stats.atimeMs
            this.info.atime_str = moment(stats.atimeMs).format()
            this.info.btime = stats.birthtimeMs
            this.info.btime_str = moment(stats.birthtimeMs).format()
            this.info.ctime = stats.ctimeMs
            this.info.ctime_str = moment(stats.ctimeMs).format()
            this.info.mtime = stats.mtimeMs
            this.info.mtime_str = moment(stats.mtimeMs).format()
          }
        })
        exec(`md5 ${this.path}`)
          .then((res) => {
            console.log(res)
            this.info.md5 = res.stdout.split(' = ')[1]
            console.log(this.info.md5)
          })
          .catch(() => {
            this.info.md5 = ''
          })
        exec(`shasum -a 1 ${this.path}`)
          .then((res) => {
            console.log(res)
            this.info.sha1 = res.stdout.split(' ')[0]
            console.log(this.info.sha1)
          })
          .catch(() => {
            this.info.sha1 = ''
          })
        exec(`shasum -a 256 ${this.path}`)
          .then((res) => {
            console.log(res)
            this.info.sha256 = res.stdout.split(' ')[0]
            console.log(this.info.sha256)
          })
          .catch(() => {
            this.info.sha256 = ''
          })
        this.$nextTick(() => {
          let container = this.$el.querySelector('.main-wapper')
          if (container) {
            this.scroll(container)
          }
        })
      },
      scroll(container) {
        this.timer = requestAnimationFrame(() => {
          if (container.scrollHeight - container.scrollTop === container.clientHeight) {
            cancelAnimationFrame(this.timer)
            return
          }
          container.scrollTop += 60
          cancelAnimationFrame(this.timer)
          this.scroll(container)
        })
      }
    }
  }
</script>
