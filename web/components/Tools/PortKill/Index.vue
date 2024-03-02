<template>
  <div class="host-edit port-kill">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">Port Kill</span>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
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
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@shared/lang'

  const SearchIcon = markRaw(Search)
  export default defineComponent({
    components: {},
    props: {},
    emits: ['doClose'],
    data() {
      return {
        Search: SearchIcon,
        port: '',
        arrs: [],
        select: []
      } as {
        Search: any
        port: string
        arrs: Array<any>
        select: Array<any>
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    mounted() {},
    unmounted() {},
    methods: {
      cleanSelect() {
        ElMessageBox.confirm(I18nT('base.killProcessConfim'), undefined, {
          confirmButtonText: I18nT('base.confirm'),
          cancelButtonText: I18nT('base.cancel'),
          closeOnClickModal: false,
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            this.$message.success(this.$t('base.success'))
            this.doSearch()
          })
          .catch(() => {})
      },
      cleanAll() {
        ElMessageBox.confirm(I18nT('base.killAllProcessConfim'), undefined, {
          confirmButtonText: I18nT('base.confirm'),
          cancelButtonText: I18nT('base.cancel'),
          closeOnClickModal: false,
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            this.$message.success(this.$t('base.success'))
            this.doSearch()
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
      }
    }
  })
</script>
