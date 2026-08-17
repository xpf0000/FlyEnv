<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left flex items-center">
          <span>{{ I18nT('common.session.list') }}</span>
          <el-tooltip :content="I18nT('common.action.delete')" placement="top" :show-after="300">
            <el-button
              link
              type="danger"
              size="small"
              class="ml-3 !text-lg"
              :icon="Delete"
              :disabled="selectedSessionIds.size === 0 || OpenCodeSetup.deletingSessions"
              @click="deleteSelectedSessions"
            />
          </el-tooltip>
        </div>
        <el-button link :disabled="OpenCodeSetup.loading" @click="OpenCodeSetup.refreshSessions()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': OpenCodeSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <div class="p-5 h-full overflow-hidden flex flex-col">
        <el-input
          v-model="search"
          :placeholder="I18nT('common.session.search')"
          clearable
          class="mb-3"
        />
        <div ref="containerRef" class="flex-1 overflow-hidden">
          <el-scrollbar>
            <el-collapse v-if="filteredGroups.length > 0" v-model="activeNames">
              <el-collapse-item
                v-for="group in filteredGroups"
                :key="group.workDir"
                :name="group.workDir"
              >
                <template #title>
                  <div class="flex min-w-0 flex-1 items-center">
                    <span class="truncate">{{ group.workDir }}</span>
                    <el-tooltip
                      :content="I18nT('host.runInTerminal')"
                      placement="top"
                      :show-after="300"
                    >
                      <el-button
                        link
                        size="small"
                        class="ml-2 shrink-0"
                        :disabled="OpenCodeSetup.isStartingSessionInTerminal(group.workDir)"
                        @click.stop="startSessionInTerminal(group.workDir)"
                      >
                        <yb-icon :svg="import('@/svg/terminal.svg?raw')" width="16" height="16" />
                      </el-button>
                    </el-tooltip>
                  </div>
                </template>
                <el-table-v2
                  :columns="columns"
                  :data="group.sessions"
                  :width="tableWidth"
                  :height="group.sessions.length * 59 + 59"
                  :header-height="59"
                  :row-height="59"
                  :row-event-handlers="{ onClick: (_e: Event, row: SessionItem) => resumeSession(row.id, row.workDir) }"
                />
              </el-collapse-item>
            </el-collapse>
            <el-empty v-else />
          </el-scrollbar>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script lang="tsx" setup>
  import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { OpenCodeSetup, SessionItem } from './setup'
  import { MoreFilled, VideoPlay, Delete } from '@element-plus/icons-vue'
  import {
    ElMessageBox,
    ElPopover,
    ElButton,
    ElIcon,
    ElTooltip,
    ElCheckbox,
    type Column
  } from 'element-plus'
  import { clipboard } from '@/util/NodeFn'
  import { MessageSuccess } from '@/util/Element'

  const search = ref('')
  const containerRef = ref<HTMLElement>()
  const tableWidth = ref(800)
  const activeNames = ref<string[]>([])
  const selectedSessionIds = ref(new Set<string>())

  const filteredGroups = computed(() => {
    const groups = OpenCodeSetup.sessionGroups
    if (!search.value) {
      return groups
    }
    const keyword = search.value.toLowerCase()
    return groups
      .map((group) => ({
        workDir: group.workDir,
        sessions: group.sessions.filter(
          (session) =>
            session.title.toLowerCase().includes(keyword) ||
            session.id.toLowerCase().includes(keyword) ||
            session.workDir.toLowerCase().includes(keyword) ||
            session.lastPrompt.toLowerCase().includes(keyword)
        )
      }))
      .filter((group) => group.sessions.length > 0)
  })

  const visibleSessionIds = computed(() =>
    filteredGroups.value.flatMap((group) => group.sessions.map((session) => session.id))
  )
  const allVisibleSelected = computed(
    () =>
      visibleSessionIds.value.length > 0 &&
      visibleSessionIds.value.every((id) => selectedSessionIds.value.has(id))
  )
  const visibleSelectionIndeterminate = computed(() => {
    const selectedCount = visibleSessionIds.value.filter((id) =>
      selectedSessionIds.value.has(id)
    ).length
    return selectedCount > 0 && selectedCount < visibleSessionIds.value.length
  })

  const setSessionSelected = (sessionId: string, selected: boolean) => {
    const next = new Set(selectedSessionIds.value)
    if (selected) {
      next.add(sessionId)
    } else {
      next.delete(sessionId)
    }
    selectedSessionIds.value = next
  }

  const setVisibleSessionsSelected = (selected: boolean) => {
    const next = new Set(selectedSessionIds.value)
    visibleSessionIds.value.forEach((sessionId) => {
      if (selected) {
        next.add(sessionId)
      } else {
        next.delete(sessionId)
      }
    })
    selectedSessionIds.value = next
  }

  const deleteSelectedSessions = () => {
    const ids = [...selectedSessionIds.value]
    if (!ids.length) {
      return
    }
    ElMessageBox.confirm(I18nT('base.delAlertContent'), I18nT('base.delAlertTitle'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(async () => {
        const deletedIds = await OpenCodeSetup.deleteSessions(ids)
        const next = new Set(selectedSessionIds.value)
        deletedIds.forEach((sessionId) => next.delete(sessionId))
        selectedSessionIds.value = next
      })
      .catch(() => {})
  }

  const startSessionInTerminal = (workDir: string) => {
    OpenCodeSetup.startSessionInTerminal(workDir)
  }

  watch(
    () => OpenCodeSetup.sessions,
    (sessions) => {
      const availableIds = new Set(sessions.map((session) => session.id))
      selectedSessionIds.value = new Set(
        [...selectedSessionIds.value].filter((sessionId) => availableIds.has(sessionId))
      )
    }
  )

  const updateTableWidth = () => {
    if (containerRef.value) {
      tableWidth.value = containerRef.value.clientWidth
    }
  }

  const resumeSession = (sessionId: string, workDir: string) => {
    OpenCodeSetup.resumeSession(sessionId, workDir)
  }

  const copyText = (text: string) => {
    clipboard.writeText(text)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const deleteSession = (row: SessionItem) => {
    ElMessageBox.confirm(I18nT('base.delAlertContent'), I18nT('base.delAlertTitle'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        OpenCodeSetup.deleteSession(row.id)
      })
      .catch(() => {})
  }

  const columns: Column<SessionItem>[] = [
    {
      key: 'selection',
      dataKey: 'selection',
      width: 52,
      align: 'center',
      headerCellRenderer: () => (
        <ElCheckbox
          modelValue={allVisibleSelected.value}
          indeterminate={visibleSelectionIndeterminate.value}
          onClick={(event: Event) => event.stopPropagation()}
          onChange={(selected: boolean) => setVisibleSessionsSelected(selected)}
        />
      ),
      cellRenderer: ({ rowData: row }) => (
        <ElCheckbox
          modelValue={selectedSessionIds.value.has(row.id)}
          onClick={(event: Event) => event.stopPropagation()}
          onChange={(selected: boolean) => setSessionSelected(row.id, selected)}
        />
      )
    },
    {
      key: 'id',
      title: I18nT('common.session.id'),
      dataKey: 'id',
      width: 220,
      align: 'center',
      headerCellRenderer: () => (
        <span class="flex items-center justify-center">{I18nT('common.session.id')}</span>
      ),
      cellRenderer: ({ rowData: row }) => (
        <ElTooltip content={row.id} placement="top" show-after={300}>
          <span
            class="truncate cursor-pointer hover:text-yellow-500"
            onClick={() => copyText(row.id)}
          >
            {row.id}
          </span>
        </ElTooltip>
      )
    },
    {
      key: 'title',
      title: I18nT('common.session.title'),
      dataKey: 'title',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      flexGrow: 1,
      headerCellRenderer: () => (
        <span class="flex items-center">{I18nT('common.session.title')}</span>
      ),
      cellRenderer: ({ rowData: row }) => (
        <ElTooltip content={row.title} placement="top" show-after={300}>
          <span class="truncate">{row.title}</span>
        </ElTooltip>
      )
    },
    {
      key: 'operation',
      title: I18nT('common.label.action'),
      dataKey: 'operation',
      width: 80,
      align: 'center',
      headerCellRenderer: () => (
        <span class="flex items-center justify-center">{I18nT('common.label.action')}</span>
      ),
      cellRenderer: ({ rowData: row }) => (
        <ElPopover
          effect="dark"
          popper-class="host-list-poper"
          placement="left-start"
          width="auto"
          show-arrow={false}
        >
          {{
            default: () => (
              <ul class="host-list-menu">
                <li onClick={() => resumeSession(row.id, row.workDir)}>
                  <ElIcon size="13">
                    <VideoPlay />
                  </ElIcon>
                  <span class="ml-3">{I18nT('common.action.resume')}</span>
                </li>
                <li onClick={() => deleteSession(row)}>
                  <ElIcon size="13">
                    <Delete />
                  </ElIcon>
                  <span class="ml-3">{I18nT('common.action.delete')}</span>
                </li>
              </ul>
            ),
            reference: () => (
              <div class="flex justify-center">
                <ElButton link icon={MoreFilled} onClick={(e: Event) => e.stopPropagation()} />
              </div>
            )
          }}
        </ElPopover>
      )
    }
  ]

  onMounted(() => {
    updateTableWidth()
    window.addEventListener('resize', updateTableWidth)
    OpenCodeSetup.refreshSessions()
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateTableWidth)
  })
</script>
