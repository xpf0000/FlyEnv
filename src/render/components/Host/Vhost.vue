<template>
  <div class="host-vhost">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
        <span class="ml-15">Vhost配置文件</span>
      </div>
    </div>

    <div class="main-wapper">
      <el-input v-model="config" class="block" type="textarea"></el-input>
      <div class="tool">
        <el-button @click="openConfig">打开</el-button>
        <el-button @click="saveConfig">保存</el-button>
      </div>
    </div>
  </div>
</template>

<script>
  import { readFileAsync, writeFileAsync } from '@shared/file'
  const { shell } = require('@electron/remote')
  const { join } = require('path')

  export default {
    components: {},
    props: {
      item: {
        type: Object,
        default() {
          return {}
        }
      }
    },
    data() {
      return {
        config: '',
        configpath: ''
      }
    },
    computed: {},
    created: function () {
      console.log('item: ', this.item)
      const baseDir = global.Server.BaseDir
      this.configpath = join(baseDir, 'vhost', this.item.flag, `${this.item.item.name}.conf`)
      console.log('this.configpath: ', this.configpath)
      this.getConfig()
    },
    unmounted() {},
    methods: {
      doClose() {
        this.$emit('doClose')
      },
      openConfig() {
        shell.showItemInFolder(this.configpath)
      },
      saveConfig() {
        writeFileAsync(this.configpath, this.config).then(() => {
          this.$message.success('配置文件保存成功')
        })
      },
      getConfig() {
        readFileAsync(this.configpath).then((conf) => {
          this.config = conf
        })
      }
    }
  }
</script>

<style lang="scss">
  .host-vhost {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: auto;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      display: flex;
      flex-direction: column;

      &::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }
      .el-textarea {
        flex: 1;

        > textarea {
          height: 100%;
        }
      }
      .tool {
        flex-shrink: 0;
        padding: 30px 0 20px 0;
      }
    }
  }
</style>
