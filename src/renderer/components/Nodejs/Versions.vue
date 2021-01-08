
<template>
  <div class="nodejs-versions">
    <div class="current-version">
      <span>当前版本</span>
      <span class="version" v-text="current"></span>
    </div>
    <div class="block">
      <span>选择版本</span>
      <el-select filterable
                 v-model="select"
                 :loading="task.getVersioning"
                 loading-text="版本获取中..."
                 :disabled="task.getVersioning || task.isRunning"
                 placeholder="请选择" class="ml-30"
      >
        <el-option
          v-for="item in task.versions"
          :key="item"
          :label="item"
          :value="item">
          <span style="float: left;" v-if="localVersions.includes(item)" v-text="item"></span>
          <span style="float: right;" v-if="localVersions.includes(item)">已安装</span>
        </el-option>
      </el-select>
      <el-button class="ml-20"
                 :disabled="task.isRunning"
                 @click="versionChange"
                 :loading="task.isRunning || task.getVersioning" v-text="task.btnTxt">
      </el-button>
    </div>
  </div>
</template>

<script>
  import { exec } from 'child-process-promise'
  import { Message } from 'element-ui'
  import { I18n } from '@/components/Locale'
  const NodeTask = {
    isRunning: false,
    getVersioning: false,
    btnTxt: '切换',
    versions: [],
    NVM_DIR: ''
  }
  export default {
    name: 'mo-nodejs-versions',
    data () {
      return {
        current: '获取中...',
        select: '',
        localVersions: [],
        task: NodeTask
      }
    },
    components: {
    },
    props: {},
    computed: {
    },
    watch: {
      currentType (nv, ov) {
        console.log(`currentType: nv: ${nv}, ov: ${ov}`)
      },
      logs () {
        this.$nextTick(() => {
          let container = this.$el.querySelector('#logs')
          if (container) {
            container.scrollTop = container.scrollHeight
          }
        })
      }
    },
    methods: {
      checkNvm () {
        return new Promise((resolve, reject) => {
          exec('[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";echo $NVM_DIR').then(res => {
            console.log(res)
            console.log('$NVM_DIR: ', res.stdout.trim())
            let NVM_DIR = res.stdout.trim()
            // 已安装
            if (NVM_DIR.length > 0) {
              this.task.NVM_DIR = NVM_DIR
              resolve(true)
            } else {
              reject(new Error('NVM_DIR未找到'))
            }
          }).catch(() => {
            reject(new Error('NVM_DIR未找到'))
          })
        })
      },
      installNvm () {
        this.task.isRunning = true
        this.task.btnTxt = 'nvm安装中...'
        exec('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash').then(res => {
          this.task.isRunning = false
          this.checkNvm().then(() => {
            this.getAllVersion()
          })
        }).catch(() => {
          this.task.isRunning = false
        })
      },
      getAllVersion () {
        if (this.task.getVersioning || this.task.versions.length > 0) {
          return
        }
        this.task.btnTxt = '版本获取中...'
        this.task.getVersioning = true
        exec(`[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm ls-remote`, {
          env: {
            NVM_DIR: this.task.NVM_DIR
          }
        }).then(res => {
          console.log(res)
          let str = res.stdout
          let all = str.match(/\sv\d+(\.\d+){1,4}\s/g).map((v) => {
            return v.trim().replace('v', '')
          })
          this.task.versions = all.reverse()
          console.log(all)
          this.task.getVersioning = false
          this.task.btnTxt = '切换'
        }).catch((err) => {
          console.log(err)
          this.task.btnTxt = '切换'
          this.task.getVersioning = false
        })
      },
      getLocalVersion () {
        exec(`[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm ls`, {
          env: {
            NVM_DIR: this.task.NVM_DIR
          }
        }).then(res => {
          let str = res.stdout
          let ls = str.split('default')[0]
          let localVersions = ls.match(/\d+(\.\d+){1,4}/g)
          this.localVersions.splice(0)
          this.localVersions.push(...localVersions)
          let reg = /default.*?(\d+(\.\d+){1,4}).*?\(/g
          let current = reg.exec(str)
          if (current.length > 1) {
            current = current[1]
            this.current = current
          }
        }).catch(() => {})
      },
      versionChange () {
        this.task.isRunning = true
        this.task.btnTxt = '切换中...'
        exec(`[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion";nvm install v${this.select};nvm alias default ${this.select}`, {
          env: {
            NVM_DIR: this.task.NVM_DIR
          }
        }).then(res => {
          this.task.btnTxt = '切换'
          this.task.isRunning = false
          this.current = this.select
          Message.success(I18n.t('task.task-success'))
        }).catch(() => {
          this.task.btnTxt = '切换'
          this.task.isRunning = false
        })
      }
    },
    created: function () {
      this.checkNvm().then(() => {
        if (this.task.versions.length === 0) {
          this.getAllVersion()
        }
        this.getLocalVersion()
      }).catch(() => {
        if (this.task.isRunning) {
          return
        }
        this.$confirm('NodeJS版本管理工具nvm未安装,现在安装?', {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(_ => {
            this.installNvm()
          })
      })
    }
  }
</script>

<style lang="scss">
  .nodejs-versions{
    display: flex;
    flex-direction: column;
    height: 100%;
    .current-version {
      margin: 20px 40px 0 40px;
      .version {
        margin-left: 25px;
      }
    }
    .block{
      display: flex;
      align-items: center;
      margin: 40px 0 30px 40px;
      flex-shrink: 0;
    }
    .logs{
      padding-left: 40px;
      flex: 1;
      width: 100%;
      display: flex;
      flex-direction: column;
      overflow: auto;
      >li{
        width: 100%;
        word-break: break-all;
      }
    }
  }
</style>
