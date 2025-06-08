<template>
  <div class="port-kill tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('util.toolProcessKill') }}</span>
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
            <el-button :disabled="arrs.length === 0 || select.length === 0" @click="cleanSelect">
              {{ I18nT('base.cleanSelect') }}
            </el-button>
            <el-button type="danger" :disabled="arrs.length === 0" @click="cleanAll">
              {{ I18nT('base.cleanAll') }}
            </el-button>
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
              <el-table-column prop="ProcessId" label="ProcessId" width="200" />
              <el-table-column prop="CommandLine" label="CommandLine" />
            </el-table>
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { MessageSuccess, MessageWarning } from '@/util/Element.ts'
  import IPC from '@/util/IPC'
  import Base from '@/core/Base'
  import { I18nT } from '@lang/index'

  const searchKey = ref('')
  const arrs = ref([])
  const select = ref([])

  const cleanSelect = () => {
    Base._Confirm(I18nT('base.killProcessConfim'), null, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        const pids = select.value.map((s) => s.ProcessId)

        IPC.send('app-fork:tools', 'processKill', pids).then((key: string) => {
          IPC.off(key)
          MessageSuccess(I18nT('base.success'))
          doSearch()
        })
      })
      .catch(() => {})
  }

  const cleanAll = () => {
    Base._Confirm(I18nT('base.killAllProcessConfim'), null, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        const pids = arrs.value.map((s) => s.ProcessId)

        IPC.send('app-fork:tools', 'processKill', pids).then((key: string) => {
          IPC.off(key)
          MessageSuccess(I18nT('base.success'))
          doSearch()
        })
      })
      .catch(() => {})
  }

  const handleSelectionChange = (selected) => {
    select.value = [...selected]
  }

  const doSearch = () => {
    arrs.value = []
    IPC.send('app-fork:tools', 'processFind', searchKey.value).then((key, res) => {
      IPC.off(key)
      const data = res?.data ?? []
      if (data.length === 0) {
        MessageWarning(I18nT('base.processNoFound'))
        return
      }
      arrs.value = [...data]
    })
  }
</script>
