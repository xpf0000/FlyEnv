<template>
  <div class="port-kill tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('util.toolProcessKill') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper pb-0 flex-1 overflow-hidden">
      <div class="main p-0">
        <el-autocomplete
          v-model.number="searchKey"
          :fetch-suggestions="querySearch"
          clearable
          class="input-with-select"
          :placeholder="I18nT('util.inputSearchKey')"
          @change="onChange"
          @select="handleSelect"
          @clear="onClear"
        >
          <template #append>
            <el-button :icon="Search" :disabled="!searchKey" @click="doSearch" />
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
              default-expand-all
              row-key="PID"
              @selection-change="handleSelectionChange"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column prop="PID" label="PID" width="240"> </el-table-column>
              <el-table-column v-if="!isWindows" prop="USER" label="User" width="110">
              </el-table-column>
              <el-table-column prop="COMMAND" label="Command"> </el-table-column>
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
  import { I18nT } from '@lang/index'
  import Base from '@/core/Base'
  import { SearchHistory } from '@/store/searchHistory'

  interface ProcessItem {
    PID: string
    PPID?: string
    USER: string
    COMMAND: string
    children?: ProcessItem[]
  }

  const searchKey = ref('')
  const arrs = ref<ProcessItem[]>([])
  const select = ref<ProcessItem[]>([])

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
    const list = SearchHistory.search?.['process'] ?? []
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
        const pids = select.value.map((s) => s.PID)
        IPC.send(`app-fork:tools`, 'killPids', '-9', pids).then((key) => {
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
        const pids = arrs.value.map((s) => s.PID)
        IPC.send(`app-fork:tools`, 'killPids', '-9', pids).then((key) => {
          IPC.off(key)
          MessageSuccess(I18nT('base.success'))
          doSearch()
        })
      })
      .catch(() => {})
  }

  const handleSelectionChange = (selection: ProcessItem[]) => {
    select.value = [...selection]
  }

  const handleSelect = (item: Record<string, any>) => {
    console.log(item)
    searchKey.value = item.value
    doSearch()
  }

  const onClear = () => {
    searchKey.value = ''
    doSearch()
  }

  const onChange = (value: string) => {
    console.log('onChange: ', value)
    searchKey.value = value
    doSearch()
  }

  const doSearch = async () => {
    arrs.value = []
    if (!searchKey.value) {
      return
    }
    SearchHistory.add('process', `${searchKey.value.trim()}`)
    IPC.send(`app-fork:tools`, 'getPidsByKey', searchKey.value).then((key, res) => {
      IPC.off(key)
      const arr = res?.data ?? []
      if (arr.length === 0) {
        MessageWarning(I18nT('base.processNoFound'))
        return
      }

      const processMap = new Map<string, ProcessItem>()
      const rootProcesses: ProcessItem[] = []

      // First pass: create all items and build the map
      arr.forEach((item: ProcessItem) => {
        processMap.set(item.PID, { ...item })
      })

      // Second pass: build the hierarchy
      arr.forEach((item: ProcessItem) => {
        const current = processMap.get(item.PID)
        if (item.PPID && processMap.has(item.PPID)) {
          const parent = processMap.get(item.PPID)
          if (parent) {
            if (!parent.children) {
              parent.children = []
            }
            parent.children.push(current!)
          }
        } else {
          rootProcesses.push(current!)
        }
      })

      arrs.value = rootProcesses
    })
  }
</script>
