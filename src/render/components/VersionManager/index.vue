<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span> {{ cardHeadTitle }} </span>
        <el-button v-if="showNextBtn" type="primary" @click="toNext">确定</el-button>
        <el-button
          v-else
          class="button"
          :disabled="currentType.getListing || brewRunning"
          type="text"
          @click="reGetData"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': currentType.getListing || brewRunning }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <ul v-if="showInstallLog || showNextBtn" ref="logs" class="logs">
      <li v-for="(log, index) in log" :key="index" class="mb-5" v-html="log"></li>
    </ul>
    <el-table
      v-else
      empty-text="可用版本获取中..."
      height="100%"
      :data="tableData"
      size="medium"
      style="width: 100%"
    >
      <el-table-column prop="name" label="brew库"> </el-table-column>
      <el-table-column prop="version" label="版本"> </el-table-column>
      <el-table-column align="center" label="是否安装" width="120">
        <template #default="scope">
          <yb-icon
            v-if="scope.row.installed"
            :svg="import('@/svg/ok.svg?raw')"
            class="installed"
          ></yb-icon>
        </template>
      </el-table-column>

      <el-table-column align="center" label="操作" width="150">
        <template #default="scope">
          <el-button
            type="text"
            :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
            :disabled="brewRunning"
            @click="handleEdit(scope.$index, scope.row)"
            >{{ scope.row.installed ? '卸载' : '安装' }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script>
  import { brewInfo, brewCheck } from '@/util/Brew.js'
  import { mapGetters } from 'vuex'
  import IPC from '@/util/IPC.js'
  export default {
    components: {},
    props: {
      typeFlag: {
        type: String,
        default: ''
      }
    },
    data() {
      return {
        showNextBtn: false,
        searchKeys: {
          apache: ['httpd'],
          nginx: ['nginx'],
          php: [
            'php',
            'php@7.2',
            'php@7.3',
            'php@7.4',
            'php@8.0',
            'shivammathur/php/php',
            'shivammathur/php/php@5.6',
            'shivammathur/php/php@7.0',
            'shivammathur/php/php@7.1',
            'shivammathur/php/php@7.2',
            'shivammathur/php/php@7.3',
            'shivammathur/php/php@7.4',
            'shivammathur/php/php@8.0',
            'shivammathur/php/php@8.2'
          ],
          memcached: ['memcached'],
          mysql: ['mysql', 'mysql@5.6', 'mysql@5.7'],
          redis: ['redis', 'redis@3.2', 'redis@4.0']
        }
      }
    },
    computed: {
      ...mapGetters('brew', {
        cardHeadTitle: 'cardHeadTitle',
        brewRunning: 'brewRunning',
        apache: 'apache',
        nginx: 'nginx',
        php: 'php',
        memcached: 'memcached',
        mysql: 'mysql',
        redis: 'redis',
        showInstallLog: 'showInstallLog',
        log: 'log'
      }),
      currentType() {
        return this[this.typeFlag]
      },
      tableData() {
        const arr = []
        const list = this[this.typeFlag].list
        for (let name in list) {
          const value = list[name]
          arr.push({
            name,
            version: value.version,
            installed: value.installed
          })
        }
        return arr
      },
      logLength() {
        return this.log.length
      }
    },
    watch: {
      brewRunning(val) {
        if (!val) {
          this.getData()
        }
      },
      typeFlag() {
        this.reGetData()
      },
      logLength() {
        if (this.showInstallLog) {
          this.$nextTick(() => {
            let container = this.$refs['logs']
            if (container) {
              container.scrollTop = container.scrollHeight
            }
          })
        }
      }
    },
    created: function () {
      console.log('created typeFlag: ', this.typeFlag)
      this.getData()
      if (!this.brewRunning) {
        this.$store.commit('brew/SET_CARD_HEAD_TITLE', '当前版本库')
      }
    },
    unmounted() {},
    methods: {
      reGetData() {
        const list = this.currentType.list
        for (let k in list) {
          delete list[k]
        }
        this.getData()
      },
      fetchData(list) {
        const arr = this.searchKeys[this.typeFlag]
        const count = arr.length
        let i = 0
        arr.forEach((name) => {
          list[name] = {}
          brewInfo(name)
            .then((res) => {
              list[name] = res
              i += 1
              if (i === count) {
                this.currentType.getListing = false
                console.log('Brew Info End !!!')
              }
            })
            .catch(() => {
              i += 1
              if (i === count) {
                this.currentType.getListing = false
                console.log('Brew Info End !!!')
              }
            })
        })
      },
      getData() {
        if (this.brewRunning || this.currentType.getListing) {
          return
        }
        const list = this.currentType.list
        if (Object.keys(list).length === 0) {
          console.log(global.Server)
          this.currentType.getListing = true
          brewCheck().then(() => {
            console.log('getData !!!')
            if (this.typeFlag === 'php') {
              IPC.send('app-fork:host', 'githubFix').then((key) => {
                IPC.off(key)
                IPC.send('app-fork:brew', 'addTap', 'shivammathur/php').then((key) => {
                  IPC.off(key)
                  this.fetchData(list)
                })
              })
            } else {
              this.fetchData(list)
            }
          })
        }
      },
      handleEdit(index, row) {
        console.log(index, row)
        if (this.brewRunning) {
          return
        }
        this.log.splice(0)
        this.$store.commit('brew/SET_SHOW_INSTALL_LOG', true)
        this.$store.commit('brew/SET_BREW_RUNNING', true)
        let fn = ''
        if (row.installed) {
          fn = 'uninstall'
          this.$store.commit('brew/SET_CARD_HEAD_TITLE', `Brew 卸载 ${row.name}`)
        } else {
          fn = 'install'
          this.$store.commit('brew/SET_CARD_HEAD_TITLE', `Brew 安装 ${row.name}`)
        }
        IPC.send('app-fork:brew', fn, row.name).then((key, res) => {
          console.log(res)
          if (res.code === 0) {
            IPC.off(key)
            this.showNextBtn = true
            this.$store.commit('brew/SET_BREW_RUNNING', false)
            this.$store.commit('brew/SET_SHOW_INSTALL_LOG', false)
            this.$store.commit('brew/RESET_BREW_INSTALLED_INITED', this.typeFlag)
            this.reGetData()
            this.$message.success('操作成功')
          } else if (res.code === 1) {
            IPC.off(key)
            this.showNextBtn = true
            this.$store.commit('brew/SET_BREW_RUNNING', false)
            this.$store.commit('brew/SET_SHOW_INSTALL_LOG', false)
            this.reGetData()
            this.$message.error('操作失败')
          } else if (res.code === 200) {
            this.log.push(res.msg)
          }
        })
      },
      toNext() {
        this.showNextBtn = false
        this.$store.commit('brew/SET_CARD_HEAD_TITLE', '当前版本库')
      }
    }
  }
</script>

<style lang="scss">
  @keyframes fa-spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .fa-spin {
    animation: fa-spin 1s 0s infinite linear;
  }

  .version-manager {
    display: flex;
    flex-direction: column;
    max-height: 100%;
    padding: 20px;
    height: 100%;

    &.el-card {
      display: flex;
      flex-direction: column;

      .el-card__header {
        flex-shrink: 0;

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
      }

      .el-card__body {
        flex: 1;
        overflow: hidden;

        .logs {
          height: 100%;
          overflow: auto;
          word-break: break-word;

          &::-webkit-scrollbar {
            display: none;
          }
        }
      }
    }

    .refresh-icon {
      width: 24px;
      height: 24px;
    }

    .installed {
      width: 18px;
      height: 18px;
      color: #01cc74;
    }
  }
</style>
