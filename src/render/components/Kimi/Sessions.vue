<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('kimi.sessions') }}</span>
        <el-button link :disabled="KimiSetup.loading" @click="KimiSetup.refreshSessions()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
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
          <el-scrollbar class="flex-1">
            <el-table :data="filteredSessions" show-overflow-tooltip style="width: 100%">
              <el-table-column prop="title" :label="I18nT('kimi.sessionTitle')">
                <template #default="scope">
                  <span class="truncate">{{ scope.row.title }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="workDir" :label="I18nT('kimi.workDir')" show-overflow-tooltip />
              <el-table-column prop="updatedAt" :label="I18nT('kimi.lastActive')" width="160" />
              <el-table-column prop="id" :label="I18nT('kimi.id')" width="220" />
              <el-table-column width="180" :label="I18nT('base.operation')" align="center">
                <template #default="{ row }">
                  <el-button link :icon="VideoPlay" @click="resumeSession(row)" />
                  <el-button link :icon="Download" @click="exportSession(row)" />
                  <el-button link type="danger" :icon="Delete" @click="deleteSession(row)" />
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="filteredSessions.length === 0" />
          </el-scrollbar>
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

<script lang="ts" setup>
  import { ref, computed, onMounted, nextTick, onUnmounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { KimiSetup, SessionItem } from './setup'
  import { Delete, Download, VideoPlay } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'
  import XTerm from '@/util/XTerm'

  const search = ref('')
  const xtermDom = ref()

  const filteredSessions = computed(() => {
    if (!search.value) return KimiSetup.sessions
    return KimiSetup.sessions.filter((s) =>
      s.title.toLowerCase().includes(search.value.toLowerCase())
    )
  })

  const resumeSession = (row: SessionItem) => {
    KimiSetup.resumeSession(row.id, xtermDom)
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

  onMounted(() => {
    if (KimiSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = KimiSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
    KimiSetup.refreshSessions()
  })

  onUnmounted(() => {
    KimiSetup?.xterm?.unmounted?.()
  })
</script>
