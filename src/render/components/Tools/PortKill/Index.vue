<template>
  <div class="port-kill tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolPortKill') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper pb-0">
      <div class="main p-0">
        <el-input
          v-model.number="port"
          placeholder="Please input port"
          class="input-with-select"
          @change="doSearch"
        >
          <template #append>
            <el-button :icon="Search" :disabled="!port" @click="doSearch" />
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
              @selection-change="handleSelectionChange"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column prop="COMMAND" label="COMMAND"> </el-table-column>
              <el-table-column prop="PID" label="PID"> </el-table-column>
              <el-table-column prop="USER" label="USER"> </el-table-column>
            </el-table>
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import { markRaw, defineComponent } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { passwordCheck } from '@/util/Brew'
  import { MessageSuccess, MessageWarning } from '@/util/Element'
  import IPC from '@/util/IPC'
  import { I18nT } from '@shared/lang'

  const SearchIcon = markRaw(Search)
  export default defineComponent({
    name: 'MoPortKill',
    components: {},
    props: {},
    emits: ['doClose'],
    data(): {
      Search: any
      port: string
      arrs: Array<any>
      select: Array<any>
    } {
      return {
        Search: SearchIcon,
        port: '',
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
        this.$baseConfirm(I18nT('base.killProcessConfim'), undefined, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            const pids = this.select.map((s: any) => {
              return s.PID
            })
            IPC.send(`app-fork:tools`, 'killPids', '-9', pids).then((key: string) => {
              IPC.off(key)
              MessageSuccess(I18nT('base.success'))
              this.doSearch()
            })
          })
          .catch(() => {})
      },
      cleanAll() {
        this.$baseConfirm(I18nT('base.killAllProcessConfim'), undefined, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            const pids = this.arrs.map((s: any) => {
              return s.PID
            })
            IPC.send(`app-fork:tools`, 'killPids', '-9', pids).then((key: string) => {
              IPC.off(key)
              MessageSuccess(I18nT('base.success'))
              this.doSearch()
            })
          })
          .catch(() => {})
      },
      handleSelectionChange(select: Array<any>) {
        console.log(...arguments)
        this.select.splice(0)
        this.select.push(...select)
      },
      doClose() {
        this.$emit('doClose')
      },
      doSearch() {
        this.arrs.splice(0)
        IPC.send(`app-fork:tools`, 'getPortPids', this.port).then((key: string, res: any) => {
          IPC.off(key)
          const arr = res?.data ?? []
          if (arr.length === 0) {
            MessageWarning(I18nT('base.portNotUse'))
            return
          }
          this.arrs.splice(0)
          this.arrs.push(...arr)
        })
      }
    }
  })
</script>
