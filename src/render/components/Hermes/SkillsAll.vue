<template>
  <div class="flex flex-col h-full">
    <template v-if="HermesSetup.installing">
      <div class="flex-1 overflow-hidden p-5">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
      <div
        class="flex-shrink-0 px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center"
      >
        <template v-if="HermesSetup.installEnd">
          <el-button type="primary" @click.stop="HermesSetup.taskConfirm()">{{
            I18nT('base.confirm')
          }}</el-button>
        </template>
        <template v-else>
          <el-button @click.stop="HermesSetup.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
        </template>
      </div>
    </template>
    <template v-else>
      <div class="flex flex-col h-full p-5">
        <div class="flex items-center gap-2 mb-3">
          <el-input
            v-model="skillSearchInput"
            :placeholder="I18nT('hermes.searchSkill')"
            clearable
            size="small"
            style="width: 300px"
            @keyup.enter="handleSearch"
          />
          <el-button size="small" type="primary" @click="handleSearch">{{
            I18nT('common.action.search')
          }}</el-button>
          <el-button style="margin-left: 0" size="small" @click="handleClearSearch">{{
            I18nT('common.action.clear')
          }}</el-button>
        </div>
        <el-table :data="currentSource.skills" style="width: 100%; flex: 1">
          <el-table-column type="index" width="50" />
          <el-table-column
            prop="name"
            :label="I18nT('common.label.name')"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column
            prop="description"
            :label="I18nT('hermes.description')"
            min-width="240"
            show-overflow-tooltip
          />
          <el-table-column
            prop="source"
            :label="I18nT('common.label.source')"
            width="120"
            show-overflow-tooltip
          />
          <el-table-column
            prop="trust"
            :label="I18nT('hermes.trust')"
            width="120"
            show-overflow-tooltip
          />
          <el-table-column :label="I18nT('common.label.action')" width="100px" align="center">
            <template #default="{ row }">
              <div class="h-full w-full flex items-center justify-center">
                <el-popover
                  effect="dark"
                  popper-class="host-list-poper"
                  placement="left-start"
                  width="auto"
                  :show-arrow="false"
                >
                  <ul v-poper-fix class="host-list-menu">
                    <li @click.stop="HermesSetup.inspectSkill(row.name)">
                      <yb-icon :svg="import('@/svg/eye.svg?raw')" width="13" height="13" />
                      <span class="ml-3">{{ I18nT('common.action.preview') }}</span>
                    </li>
                    <li @click.stop="installSkill(row.name)">
                      <yb-icon :svg="import('@/svg/Download.svg?raw')" width="13" height="13" />
                      <span class="ml-3">{{ I18nT('base.install') }}</span>
                    </li>
                  </ul>

                  <template #reference>
                    <div
                      class="w-[30px] h-[30px] flex items-center justify-center cursor-pointer hover:text-yellow-500"
                    >
                      <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                    </div>
                  </template>
                </el-popover>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div class="flex justify-start mt-3">
          <el-pagination
            v-model:current-page="currentSource.page"
            v-model:page-size="currentSource.pageSize"
            :total="currentSource.total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @size-change="handlePageChange"
            @current-change="handlePageChange"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
  import { I18nT } from '@lang/index'
  import { HermesSetup } from './setup'
  import XTerm from '@/util/XTerm'

  const xtermDom = ref()
  const skillSearchInput = ref('')

  const installSkill = (name: string) => {
    HermesSetup.installSkill(name, xtermDom)
  }

  onMounted(() => {
    if (HermesSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = HermesSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    HermesSetup?.xterm?.unmounted?.()
  })

  const currentSource = computed(() => {
    const tab = HermesSetup.skillTab
    if (tab === 'installed') {
      return HermesSetup.onlineSkill['all']
    }
    return HermesSetup.onlineSkill[tab]
  })

  const handleSearch = () => {
    currentSource.value.page = 1
    if (skillSearchInput.value) {
      HermesSetup.searchAllSkills(skillSearchInput.value)
    } else {
      HermesSetup.browseAllSkills()
    }
  }

  const handleClearSearch = () => {
    skillSearchInput.value = ''
    currentSource.value.page = 1
    HermesSetup.browseAllSkills()
  }

  const handlePageChange = () => {
    if (skillSearchInput.value) {
      HermesSetup.searchAllSkills(skillSearchInput.value)
    } else {
      HermesSetup.browseAllSkills()
    }
  }

  watch(
    () => HermesSetup.skillTab,
    () => {
      skillSearchInput.value = ''
    }
  )
</script>
