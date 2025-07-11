<template>
  <div class="port-kill tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('util.toolPortKill') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper flex-1 overflow-hidden">
      <div class="main">
        <el-autocomplete
          v-model.number="port"
          :fetch-suggestions="querySearch"
          clearable
          class="input-with-select"
          placeholder="Please Input Port"
          @change="onChange"
          @select="handleSelect"
          @clear="onClear"
        >
          <template #append>
            <el-button :icon="Search" :disabled="!port" @click="doSearch" />
          </template>
        </el-autocomplete>
        <div class="table-wapper">
          <div class="btn-cell">
            <el-button :disabled="arrs.length === 0 || select.length === 0" @click="cleanSelect">{{
              I18nT('base.cleanSelect')
            }}</el-button>
            <el-button type="danger" :disabled="arrs.length === 0" @click="cleanAll">{{
              I18nT('base.cleanAll')
            }}</el-button>
          </div>
          <el-card :header="null" shadow="never">
            <el-table
              height="100%"
              :data="arrs"
              size="default"
              style="width: 100%"
              @selection-change="handleSelectionChange"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column prop="PID" label="PID"> </el-table-column>
              <el-table-column v-if="!isWindows" prop="USER" label="User" width="110">
              </el-table-column>
              <el-table-column prop="COMMAND" label="COMMAND"> </el-table-column>
            </el-table>
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { MessageSuccess, MessageWarning } from '@/util/Element'
  import IPC from '@/util/IPC'
  import Base from '@/core/Base'
  import { I18nT } from '@lang/index'
  import { SearchHistory } from '@/store/searchHistory'

  const port = ref('')
  const arrs = ref<Array<any>>([])
  const select = ref<Array<any>>([])

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })
  const isWindows = computed(() => {
    return window.Server.isWindows
  })
  const isLinux = computed(() => {
    return window.Server.isLinux
  })

  SearchHistory.init()

  const searchHistory = computed(() => {
    const list = SearchHistory.search?.['port'] ?? []
    return list.map((l) => ({ value: l }))
  })

  const querySearch = (queryString: string, cb: any) => {
    const search = queryString.toLowerCase()
    const results = queryString
      ? searchHistory.value.filter((f) => {
          const value = f.value.toLowerCase()
          return value.includes(search) || search.includes(value)
        })
      : searchHistory.value
    cb(results)
  }

  const cleanSelect = () => {
    Base._Confirm(I18nT('base.killProcessConfirm'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        const pids = select.value.map((s: any) => s.PID)

        IPC.send('app-fork:tools', 'killPids', '-9', pids).then((key: string) => {
          IPC.off(key)
          MessageSuccess(I18nT('base.success'))
          doSearch()
        })
      })
      .catch(() => {})
  }

  const cleanAll = () => {
    Base._Confirm(I18nT('base.killAllProcessConfirm'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        const pids = arrs.value.map((s: any) => s.PID)

        IPC.send('app-fork:tools', 'killPids', '-9', pids).then((key: string) => {
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

  const handleSelect = (item: Record<string, any>) => {
    console.log(item)
    port.value = item.value
    doSearch()
  }

  const onClear = () => {
    port.value = ''
    doSearch()
  }

  const onChange = (value: string) => {
    console.log('onChange: ', value)
    port.value = value
    doSearch()
  }

  const doSearch = () => {
    arrs.value = []
    if (!port.value) {
      return
    }
    SearchHistory.add('port', `${port.value}`)
    IPC.send('app-fork:tools', 'getPortPids', port.value).then((key: string, res: any) => {
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
