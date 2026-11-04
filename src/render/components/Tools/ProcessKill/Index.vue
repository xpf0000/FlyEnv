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
          v-model="searchKey"
          :fetch-suggestions="querySearch"
          clearable
          class="input-with-select"
          :placeholder="I18nT('util.inputSearchKey')"
          @change="onChange"
          @select="handleSelect"
          @clear="onClear"
        >
          <template #append>
            <el-button
              :icon="Search"
              :disabled="!searchKey"
              :loading="controller.querying"
              @click="doSearch"
            />
          </template>
        </el-autocomplete>
        <div class="table-wapper">
          <div class="btn-cell flex items-center">
            <el-button
              :disabled="
                arrs.length === 0 ||
                select.length === 0 ||
                controller.querying ||
                controller.killing
              "
              @click="cleanSelect"
              >{{ I18nT('base.cleanSelect') }}</el-button
            >
            <el-button
              type="danger"
              :disabled="arrs.length === 0 || controller.querying || controller.killing"
              @click="cleanAll"
              >{{ I18nT('base.cleanAll') }}</el-button
            >
            <el-checkbox
              v-if="!isWindows"
              v-model="useSudo"
              class="ml-3"
              :disabled="controller.killing"
            >
              sudo
            </el-checkbox>
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
  import controller, { type ProcessItem } from './Controller'
  import Base from '@/core/Base'
  import { I18nT } from '@lang/index'
  import { SearchHistory } from '@/store/searchHistory'

  const useSudo = ref(false)
  const searchKey = ref(controller.lastKey)
  const arrs = computed(() => controller.rows)
  const select = ref<ProcessItem[]>([])

  const isWindows = computed(() => {
    return window.Server.isWindows
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
    const pids = select.value.map((s) => s.PID)
    const sudo = useSudo.value
    Base._Confirm(I18nT('base.killProcessConfirm'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        controller.kill(pids, sudo)
      })
      .catch(() => {})
  }

  const cleanAll = () => {
    const pids = controller.processes.map((s) => s.PID)
    const sudo = useSudo.value
    Base._Confirm(I18nT('base.killAllProcessConfirm'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        controller.kill(pids, sudo)
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

  const doSearch = () => {
    if (searchKey.value) SearchHistory.add('process', searchKey.value.trim())
    controller.search(`${searchKey.value}`)
  }
</script>
