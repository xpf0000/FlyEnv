<template>
  <div class="port-kill tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolPortKill') }}</span>
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
  import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
  import { execPromiseRoot } from '@shared/Exec'

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
        this.$baseConfirm(this.$t('base.killProcessConfim'), undefined, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(async () => {
            const pids = this.select.map((s: any) => {
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
        this.$baseConfirm(this.$t('base.killAllProcessConfim'), undefined, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(async () => {
            const pids = this.arrs.map((s: any) => {
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
      handleSelectionChange(select: Array<any>) {
        console.log(...arguments)
        this.select.splice(0)
        this.select.push(...select)
      },
      doClose() {
        this.$emit('doClose')
      },
      async doSearch() {
        this.arrs.splice(0)
        const res = await execPromiseRoot(`lsof -nP -i:${this.port} | awk '{print $1,$2,$3}'`)
        const arr = res.stdout
          .toString()
          .trim()
          .split('\n')
          .filter((v: any, i: number) => {
            return i > 0
          })
          .map((a: any) => {
            const list = a.split(' ').filter((s: string) => {
              return s.trim().length > 0
            })
            const USER = list.pop()
            const PID = list.pop()
            const COMMAND = list.join(' ')
            return {
              USER,
              PID,
              COMMAND
            }
          })
        if (arr.length === 0) {
          MessageWarning(this.$t('base.portNotUse'))
          return
        }
        this.arrs.splice(0)
        this.arrs.push(...arr)
      }
    }
  })
</script>
