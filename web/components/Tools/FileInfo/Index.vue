<template>
  <div class="host-edit tools-file-info">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">File Info</span>
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
  export default {
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
      choosePath() {},
      getInfo() {}
    }
  }
</script>
