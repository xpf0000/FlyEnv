<template>
  <div class="nodejs-versions">
    <div class="current-version">
      <span>当前版本</span>
      <span class="version">{{ current }}</span>
    </div>
    <div class="block">
      <span>选择版本</span>
      <el-select
        v-model="select"
        filterable
        :loading="task.getVersioning"
        loading-text="版本获取中..."
        :disabled="task.getVersioning || task.isRunning"
        placeholder="请选择"
        class="ml-30"
      >
        <template v-for="item in localVersions" :key="item">
          <el-option :label="item" :value="item">
            <span style="float: left" v-text="item"></span>
            <span style="float: right">已安装</span>
          </el-option>
        </template>
        <template v-for="item in task.versions" :key="item">
          <template v-if="!localVersions.includes(item)"></template>
          <el-option :label="item" :value="item"></el-option>
        </template>
      </el-select>
      <el-button
        class="ml-20"
        :disabled="task.isRunning"
        :loading="task.isRunning || task.getVersioning"
        @click="versionChange"
      >
        {{ task.btnTxt }}
      </el-button>
    </div>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import IPC from '@/util/IPC.js'
  const { exec } = require('child-process-promise')

  export default {
    name: 'MoNodejsVersions',
    components: {},
    props: {},
    data() {
      return {
        current: '获取中...',
        select: '',
        localVersions: []
      }
    },
    computed: {
      ...mapGetters('task', {
        task: 'node'
      })
    },
    watch: {
      currentType(nv, ov) {
        console.log(`currentType: nv: ${nv}, ov: ${ov}`)
      },
      logs() {
        this.$nextTick(() => {
          let container = this.$el.querySelector('#logs')
          if (container) {
            container.scrollTop = container.scrollHeight
          }
        })
      }
    },
    created: function () {
      this.checkNvm()
        .then(() => {
          if (this.task.versions.length === 0) {
            this.getAllVersion()
          }
          this.getLocalVersion()
        })
        .catch(() => {
          if (this.task.isRunning) {
            return
          }
          this.$baseConfirm('NodeJS版本管理工具nvm未安装,现在安装?', null, {
            customClass: 'confirm-del',
            type: 'warning'
          }).then(() => {
            this.installNvm()
          })
        })
    },
    methods: {
      checkNvm() {
        return new Promise((resolve, reject) => {
          if (this.task.NVM_DIR) {
            resolve(true)
            return
          }
          IPC.send('app-fork:node', 'nvmDir').then((key, res) => {
            IPC.off(key)
            if (res?.NVM_DIR) {
              this.task.NVM_DIR = res.NVM_DIR
              resolve(true)
            } else {
              reject(new Error('NVM_DIR未找到'))
            }
          })
        })
      },
      installNvm() {
        this.task.isRunning = true
        this.task.btnTxt = 'nvm安装中...'
        IPC.send('app-fork:node', 'installNvm').then((key, res) => {
          IPC.off(key)
          this.task.isRunning = false
          if (res?.code === 0) {
            this.checkNvm().then(() => {
              this.getAllVersion()
            })
          } else {
            this.$message.error('NVM安装失败')
          }
        })
      },
      getAllVersion() {
        if (this.task.getVersioning || this.task.versions.length > 0) {
          return
        }
        this.task.btnTxt = '版本获取中...'
        this.task.getVersioning = true
        IPC.send('app-fork:node', 'allVersion', this.task.NVM_DIR).then((key, res) => {
          IPC.off(key)
          if (res?.versions) {
            this.task.versions = res.versions
            this.task.getVersioning = false
            this.task.btnTxt = '切换'
          } else {
            this.task.btnTxt = '切换'
            this.task.getVersioning = false
            this.$message.error('Node可用版本获取失败')
          }
        })
      },
      getLocalVersion() {
        IPC.send('app-fork:node', 'localVersion', this.task.NVM_DIR).then((key, res) => {
          IPC.off(key)
          if (res?.versions) {
            this.localVersions.splice(0)
            this.localVersions.push(...res.versions)
            this.current = res.current
          }
        })
      },
      versionChange() {
        this.task.isRunning = true
        this.task.btnTxt = '切换中...'
        IPC.send('app-fork:node', 'versionChange', this.task.NVM_DIR, this.select).then(
          (key, res) => {
            IPC.off(key)
            if (res?.code === 0) {
              this.task.btnTxt = '切换'
              this.task.isRunning = false
              this.current = this.select
              this.$message.success('操作成功')
            } else {
              this.task.btnTxt = '切换'
              this.task.isRunning = false
              this.$message.error('版本切换失败')
            }
          }
        )
      }
    }
  }
</script>

<style lang="scss">
  .nodejs-versions {
    display: flex;
    flex-direction: column;
    height: 100%;
    .current-version {
      margin: 20px 40px 0 40px;
      .version {
        margin-left: 25px;
      }
    }
    .block {
      display: flex;
      align-items: center;
      margin: 40px 0 30px 40px;
      flex-shrink: 0;
    }
    .logs {
      padding-left: 40px;
      flex: 1;
      width: 100%;
      display: flex;
      flex-direction: column;
      overflow: auto;
      > li {
        width: 100%;
        word-break: break-all;
      }
    }
  }
</style>
