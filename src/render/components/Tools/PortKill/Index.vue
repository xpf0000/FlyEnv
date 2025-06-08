<template>
  <div class="port-kill tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('util.toolPortKill') }}</span>
        <slot name="like"></slot>
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
              I18nT('base.cleanSelect')
            }}</el-button>
            <el-button type="danger" :disabled="arrs.length === 0" @click="cleanAll">{{
              I18nT('base.cleanAll')
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
              <el-table-column prop="PID" label="PID"> </el-table-column>
              <el-table-column prop="COMMAND" label="COMMAND"> </el-table-column>
            </el-table>
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { MessageSuccess, MessageWarning } from '@/util/Element'
  import IPC from '@/util/IPC'
  import Base from '@/core/Base'
  import { I18nT } from '@lang/index'

  const port = ref('')
  const arrs = ref<Array<any>>([])
  const select = ref<Array<any>>([])

  const cleanSelect = () => {
    Base._Confirm(I18nT('base.killProcessConfim'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        const pids = select.value.map((s: any) => s.PID)

        IPC.send('app-fork:tools', 'processKill', pids).then((key: string) => {
          IPC.off(key)
          MessageSuccess(I18nT('base.success'))
          doSearch()
        })
      })
      .catch(() => {})
  }

  const cleanAll = () => {
    Base._Confirm(I18nT('base.killAllProcessConfim'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        const pids = arrs.value.map((s: any) => s.PID)

        IPC.send('app-fork:tools', 'processKill', pids).then((key: string) => {
          IPC.off(key)
          MessageSuccess(I18nT('base.success'))
          doSearch()
        })
      })
      .catch(() => {})
  }

  const handleSelectionChange = (selection: Array<any>) => {
    select.value = [...selection]
  }

  const doSearch = () => {
    arrs.value = []
    IPC.send('app-fork:tools', 'portFind', port.value).then((key: string, res: any) => {
      IPC.off(key)
      const data = res?.data ?? []
      if (data.length === 0) {
        MessageWarning(I18nT('base.portNotUse'))
        return
      }
      arrs.value = [...data]
    })
  }
</script>
