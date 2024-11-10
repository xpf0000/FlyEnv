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
              @selection-change="handleSelectionChange"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column prop="USER" label="USER" width="110"> </el-table-column>
              <el-table-column prop="PID" label="PID" width="90"> </el-table-column>
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
  import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element.ts'

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
      cleanSelect() {},
      cleanAll() {},
      handleSelectionChange(select) {
        console.log(...arguments)
        this.select.splice(0)
        this.select.push(...select)
      },
      doClose() {
        this.$emit('doClose')
      },
      async doSearch() {}
    }
  }
</script>
