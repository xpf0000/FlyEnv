<template>
  <div class="port-kill tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolProcessKill') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper pb-0">
      <div class="main p-0">
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
              style="width: 100%"
              default-expand-all
              row-key="PID"
              @selection-change="handleSelectionChange"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column prop="PID" label="PID" width="240"> </el-table-column>
              <el-table-column prop="USER" label="USER" width="110"> </el-table-column>
              <el-table-column prop="COMMAND" label="COMMAND"> </el-table-column>
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
  import { passwordCheck } from '@/util/Brew.ts'
  import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element.ts'
  import { execPromiseRoot } from '@shared/Exec.ts'
  import { ProcessListSearch } from '@shared/Process.ts'

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
        this.$baseConfirm(this.$t('base.killProcessConfim'), null, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(async () => {
            const pids = this.select.map((s) => {
              return s.PID
            })
            try {
              await execPromiseRoot(['kill', '-9', ...pids])
              MessageSuccess(this.$t('base.success'))
              this.doSearch().then()
            } catch (e) {
              MessageError(this.$t('base.fail'))
            }
          })
          .catch(() => {})
      },
      cleanAll() {
        this.$baseConfirm(this.$t('base.killAllProcessConfim'), null, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(async () => {
            const pids = this.arrs.map((s) => {
              return s.PID
            })
            try {
              await execPromiseRoot(['kill', '-9', ...pids])
              MessageSuccess(this.$t('base.success'))
              this.doSearch().then()
            } catch (e) {
              MessageError(this.$t('base.fail'))
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
      async doSearch() {
        this.arrs.splice(0)
        const arr = await ProcessListSearch(this.searchKey, false)
        if (arr.length === 0) {
          MessageWarning(this.$t('base.processNoFound'))
          return
        }
        const arrs = []
        const findSub = (item) => {
          const sub = []
          for (const s of arr) {
            if (s.PPID === item.PID) {
              sub.push(s)
            }
          }
          if (sub.length > 0) {
            item.children = sub
          }
        }
        for (const item of arr) {
          findSub(item)
          const p = arr.find((s) => s.PID === item.PPID)
          if (!p) {
            arrs.push(item)
          }
        }
        this.arrs.splice(0)
        this.arrs.push(...arrs)
      }
    }
  }
</script>
