<template>
  <div class="port-kill">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
        <span class="ml-15">Process Kill</span>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
        <el-input
          v-model="searchKey"
          placeholder="Please input search key"
          class="input-with-select"
        >
          <template #append>
            <el-button :icon="Search" :disabled="!searchKey" @click="doSearch" />
          </template>
        </el-input>

        <div class="table-wapper">
          <div class="btn-cell">
            <el-button :disabled="arrs.length === 0 || select.length === 0" @click="cleanSelect"
              >清除选择</el-button
            >
            <el-button type="danger" :disabled="arrs.length === 0" @click="cleanAll"
              >清除全部</el-button
            >
          </div>
          <el-table
            height="100%"
            :data="arrs"
            size="default"
            style="width: 100%"
            @selection-change="handleSelectionChange"
          >
            <el-table-column type="selection" width="55" />
            <el-table-column prop="USER" label="USER" width="110"> </el-table-column>
            <el-table-column prop="PID" label="PID" width="90"> </el-table-column>
            <el-table-column prop="COMMAND" label="COMMAND"> </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { markRaw } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { passwordCheck } from '@/util/Brew'
  const { execSync } = require('child_process')

  export default {
    components: {},
    props: {},
    data() {
      return {
        Search: markRaw(Search),
        searchKey: '',
        arrs: [],
        select: []
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    mounted() {
      passwordCheck().then(() => {})
    },
    unmounted() {},
    methods: {
      cleanSelect() {
        this.$baseConfirm('确认结束所选进程?', null, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            const pids = this.select
              .map((s) => {
                return s.PID
              })
              .join(' ')
            try {
              execSync(`echo '${global.Server.Password}' | sudo -S kill -9 ${pids}`)
              this.$message.success('操作成功')
              this.doSearch()
            } catch (e) {
              this.$message.error('操作失败')
            }
          })
          .catch(() => {})
      },
      cleanAll() {
        this.$baseConfirm('确认结束全部进程?', null, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            const pids = this.arrs
              .map((s) => {
                return s.PID
              })
              .join(' ')
            try {
              execSync(`echo '${global.Server.Password}' | sudo -S kill -9 ${pids}`)
              this.$message.success('操作成功')
              this.doSearch()
            } catch (e) {
              this.$message.error('操作失败')
            }
          })
          .catch(() => {})
      },
      handleSelectionChange(select) {
        console.log(...arguments)
        this.select.splice(0)
        this.select.push(...select)
      },
      doClose() {
        this.$emit('doClose')
      },
      doSearch() {
        this.arrs.splice(0)
        const res = execSync(
          `echo '${global.Server.Password}' | sudo -S ps aux | grep '${this.searchKey}'`
        )
          .toString()
          .trim()
        const arr = res
          .split('\n')
          .filter((v) => {
            return !v.includes(`grep ${this.searchKey}`) && !v.includes(`grep '${this.searchKey}'`)
          })
          .map((a) => {
            const list = a.split(' ').filter((s) => {
              return s.trim().length > 0
            })
            const USER = list.shift()
            const PID = list.shift()
            Array(8)
              .fill(0)
              .forEach(() => {
                list.shift()
              })
            const COMMAND = list.join(' ')
            return {
              USER,
              PID,
              COMMAND
            }
          })
        if (arr.length === 0) {
          this.$message.warning('未查询到相关进程')
          return
        }
        this.arrs.splice(0)
        this.arrs.push(...arr)
      }
    }
  }
</script>

<style lang="scss">
  .port-kill {
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
      &::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }

      .el-input-group__append {
        overflow: hidden;

        > button {
          display: flex;
          border-radius: 0;
        }
      }

      .main {
        background: #32364a;
        border-radius: 8px;
        padding: 20px 20px 10px 20px;
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;

        > .el-input {
          flex-shrink: 0;
        }

        .table-wapper {
          flex: 1;
          padding: 30px 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;

          .btn-cell {
            flex-shrink: 0;
          }

          .el-table {
            margin-top: 20px;
            flex: 1;
          }
        }
      }
      .plant-title {
        padding: 22px 24px;
        font-size: 15px;
        font-weight: 600;
      }
    }
  }
</style>
