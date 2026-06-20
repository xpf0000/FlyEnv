<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('kimi.sessions') }}</span>
        <el-button link :disabled="KimiSetup.loading" @click="KimiSetup.refreshSessions()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': KimiSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <template v-if="KimiSetup.installing">
        <div class="w-full h-full overflow-hidden p-5">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else>
        <div class="p-5 h-full overflow-hidden flex flex-col">
          <el-input
            v-model="search"
            :placeholder="I18nT('kimi.searchSession')"
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
                  :title="group.workDir"
                >
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
      </template>
    </div>
    <template v-if="KimiSetup.installing" #footer>
      <template v-if="KimiSetup.installEnd">
        <el-button type="primary" @click.stop="KimiSetup.taskConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="KimiSetup.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="tsx" setup>
  import { ref, computed, onMounted, nextTick, onUnmounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { KimiSetup, SessionItem } from './setup'
  import { MoreFilled, VideoPlay, Download, Delete } from '@element-plus/icons-vue'
  import { ElMessageBox, ElPopover, ElButton, ElIcon, ElTooltip, type Column } from 'element-plus'
  import XTerm from '@/util/XTerm'
  import { clipboard } from '@/util/NodeFn'
  import { MessageSuccess } from '@/util/Element'

  const search = ref('')
  const xtermDom = ref()
  const containerRef = ref<HTMLElement>()
  const tableWidth = ref(800)
  const activeNames = ref<string[]>([])

  const filteredGroups = computed(() => {
    const groups = KimiSetup.sessionGroups
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

  const updateTableWidth = () => {
    if (containerRef.value) {
      tableWidth.value = containerRef.value.clientWidth
    }
  }

  const resumeSession = (sessionId: string, workDir: string) => {
    KimiSetup.resumeSession(sessionId, workDir)
  }

  const copyText = (text: string) => {
    clipboard.writeText(text)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const exportSession = (row: SessionItem) => {
    KimiSetup.exportSession(row.id, xtermDom)
  }

  const deleteSession = (row: SessionItem) => {
    ElMessageBox.confirm(I18nT('base.delAlertContent'), I18nT('base.delAlertTitle'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        KimiSetup.deleteSession(row.id)
      })
      .catch(() => {})
  }

  const columns: Column<SessionItem>[] = [
    {
      key: 'id',
      title: I18nT('kimi.sessionId'),
      dataKey: 'id',
      width: 180,
      align: 'center',
      headerCellRenderer: () => (
        <span class="flex items-center justify-center">{I18nT('kimi.sessionId')}</span>
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
      title: I18nT('kimi.sessionTitle'),
      dataKey: 'title',
      width: 200,
      headerCellRenderer: () => <span class="flex items-center">{I18nT('kimi.sessionTitle')}</span>,
      cellRenderer: ({ rowData: row }) => (
        <ElTooltip content={row.title} placement="top" show-after={300}>
          <span class="truncate">{row.title}</span>
        </ElTooltip>
      )
    },
    {
      key: 'lastPrompt',
      title: I18nT('kimi.lastPrompt'),
      dataKey: 'lastPrompt',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      flexGrow: 1,
      headerCellRenderer: () => <span class="flex items-center">{I18nT('kimi.lastPrompt')}</span>,
      cellRenderer: ({ rowData: row }) => (
        <ElTooltip content={row.lastPrompt} placement="top" show-after={300}>
          <span class="truncate text-gray-500">{row.lastPrompt}</span>
        </ElTooltip>
      )
    },
    {
      key: 'operation',
      title: I18nT('base.action'),
      dataKey: 'operation',
      width: 80,
      align: 'center',
      headerCellRenderer: () => (
        <span class="flex items-center justify-center">{I18nT('base.action')}</span>
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
                  <span class="ml-3">{I18nT('kimi.resume')}</span>
                </li>
                <li onClick={() => exportSession(row)}>
                  <ElIcon size="13">
                    <Download />
                  </ElIcon>
                  <span class="ml-3">{I18nT('kimi.cmd.export')}</span>
                </li>
                <li onClick={() => deleteSession(row)}>
                  <ElIcon size="13">
                    <Delete />
                  </ElIcon>
                  <span class="ml-3">{I18nT('base.del')}</span>
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
    if (KimiSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = KimiSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
    updateTableWidth()
    window.addEventListener('resize', updateTableWidth)
    KimiSetup.refreshSessions()
  })

  onUnmounted(() => {
    KimiSetup?.xterm?.unmounted?.()
    window.removeEventListener('resize', updateTableWidth)
  })
</script>
