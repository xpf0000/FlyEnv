<template>
  <div class="port-kill tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolProcessKill') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
        <el-input
          v-model="searchKey"
          placeholder="Please input search key"
          class="input-with-select"
          @change="doSearch"
        >
          <template #append>
            <el-button :icon="Search" :disabled="!searchKey" @click="doSearch" />
          </template>
        </el-input>

        <div class="table-wapper">
          <div class="btn-cell">
            <el-button :disabled="arrs.length === 0 || select.length === 0" @click="cleanSelect">{{
              $t('base.cleanSelect')
            }}</el-button>
            <el-button type="danger" :disabled="arrs.length === 0" @click="cleanAll">{{
              $t('base.cleanAll')
            }}</el-button>
          </div>
          <el-card :header="null" :shadow="false">
            <el-table
              height="100%"
              :data="arrs"
              size="default"
              default-expand-all
              row-key="ProcessId"
              style="width: 100%"
              @selection-change="handleSelectionChange"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column prop="ProcessId" label="ProcessId" width="90"> </el-table-column>
              <el-table-column prop="CommandLine" label="CommandLine"> </el-table-column>
            </el-table>
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { markRaw } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { MessageSuccess, MessageWarning } from '@/util/Element.ts'
  import IPC from '@/util/IPC'

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
    mounted() {},
    unmounted() {},
    methods: {
      cleanSelect() {
        this.$baseConfirm(this.$t('base.killProcessConfim'), null, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            const pids = this.select.map((s) => {
              return s.ProcessId
            })

            IPC.send('app-fork:tools', 'processKill', pids).then((key, res) => {
              IPC.off(key)
              MessageSuccess(this.$t('base.success'))
              this.doSearch()
            })
          })
          .catch(() => {})
      },
      cleanAll() {
        this.$baseConfirm(this.$t('base.killAllProcessConfim'), null, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            const pids = this.arrs.map((s) => {
              return s.ProcessId
            })

            IPC.send('app-fork:tools', 'processKill', pids).then((key, res) => {
              IPC.off(key)
              MessageSuccess(this.$t('base.success'))
              this.doSearch()
            })
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
        IPC.send('app-fork:tools', 'processFind', this.searchKey).then((key, res) => {
          IPC.off(key)
          const data = res?.data ?? []
          if (data.length === 0) {
            MessageWarning(this.$t('base.processNoFound'))
            return
          }
          this.arrs.splice(0)
          this.arrs.push(...data)
        })
      }
    }
  }
</script>
