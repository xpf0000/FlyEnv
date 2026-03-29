<template>
  <div ref="runListRef" class="host-list run-project-list">
    <el-card :header="null">
      <el-table
        v-loading="loading"
        :data="runProjects"
        row-key="id"
        :row-class-name="tableRowClassName"
      >
        <el-table-column :label="I18nT('host.project')">
          <template #header>
            <div class="w-full name-cell">
              <span style="display: inline-flex; align-items: center; padding: 2px 0">
                {{ I18nT('host.project') }}
              </span>
              <el-input
                v-model.trim="search"
                :placeholder="I18nT('base.placeholderSearch')"
                clearable
              ></el-input>
            </div>
          </template>
          <template #default="scope">
            <div
              class="host-list-table-cell-id"
              style="display: none"
              :data-project-id="scope.row.id"
            ></div>
            <QrcodePopper :url="getSiteUrl(scope.row)">
              <div class="link" @click.stop="openSite(scope.row)">
                <yb-icon
                  :class="{ active: scope.row.state.isRun }"
                  :svg="import('@/svg/link.svg?raw')"
                  width="18"
                  height="18"
                />
                <span>{{ scope.row.comment }}</span>
              </div>
            </QrcodePopper>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('host.folder')" width="180px">
          <template #default="scope">
            <el-popover width="auto" :show-after="800" placement="top">
              <template #default>
                <span>{{ scope.row.path }}</span>
              </template>
              <template #reference>
                <span
                  class="truncate cursor-pointer hover:text-yellow-500"
                  @click.stop="shell.openPath(scope.row.path)"
                >
                  {{ basename(scope.row.path) }}
                </span>
              </template>
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('host.port')" width="100px" align="center">
          <template #default="scope">
            <span>{{ scope.row.projectPort }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('base.version')" width="100px" align="center">
          <template #default="scope">
            <span>{{ scope.row.binVersion || I18nT('host.useSysVersion') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('base.service')" width="110px" align="center">
          <template #default="scope">
            <template v-if="scope.row.state.running">
              <el-button :loading="true" link></el-button>
            </template>
            <template v-else>
              <template v-if="scope.row.state.isRun">
                <el-button link class="status running" @click.stop="serviceDo('stop', scope.row)">
                  <yb-icon :svg="import('@/svg/stop2.svg?raw')" />
                </el-button>
                <el-button
                  link
                  class="status refresh"
                  @click.stop="serviceDo('restart', scope.row)"
                >
                  <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" />
                </el-button>
              </template>
              <template v-else>
                <el-button
                  link
                  class="status start current"
                  @click.stop="serviceDo('start', scope.row)"
                >
                  <yb-icon :svg="import('@/svg/play.svg?raw')" />
                </el-button>
              </template>
            </template>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('host.action')" width="100px">
          <template #default="scope">
            <el-popover
              effect="dark"
              popper-class="host-list-poper"
              placement="left-start"
              width="auto"
              :show-arrow="false"
            >
              <ul v-poper-fix class="host-list-menu">
                <li @click.stop="action(scope.row, 'open')">
                  <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('base.open') }}</span>
                </li>
                <li @click.stop="action(scope.row, 'edit')">
                  <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('base.edit') }}</span>
                </li>
                <li v-if="scope.row.configPath?.length" @click.stop="action(scope.row, 'config')">
                  <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('base.configFile') }}</span>
                </li>
                <li v-if="scope.row.logPath?.length" @click.stop="action(scope.row, 'log')">
                  <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('base.log') }}</span>
                </li>
                <li @click.stop="action(scope.row, 'link')">
                  <yb-icon :svg="import('@/svg/link.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('base.links') }}</span>
                </li>
                <li @click.stop="action(scope.row, 'del')">
                  <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('base.del') }}</span>
                </li>
              </ul>
              <template #reference>
                <div class="right">
                  <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                </div>
              </template>
            </el-popover>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import Base from '@/core/Base'
  import type { LanguageProjectRunnerItem } from '@/core/LanguageProjectRunner'
  import { shell } from '@/util/NodeFn'
  import { basename as getBasename } from '@/util/path-browserify'
  import QrcodePopper from '../Host/Qrcode/Index.vue'

  const props = defineProps<{
    projects: LanguageProjectRunnerItem[]
  }>()

  const emit = defineEmits<{
    edit: [item: LanguageProjectRunnerItem]
    del: [id: string]
  }>()

  const loading = ref(false)
  const search = ref('')
  const runListRef = ref()

  const basename = getBasename

  const runProjects = computed(() => {
    if (!search.value) {
      return props.projects
    }
    return props.projects.filter(
      (p) =>
        p.comment.includes(search.value) ||
        p.path.includes(search.value) ||
        p.domain.includes(search.value)
    )
  })

  const tableRowClassName = ({ row }: { row: LanguageProjectRunnerItem }) => {
    if (row?.isSorting) {
      return 'is-sorting'
    }
    return ''
  }

  const getSiteUrl = (item: LanguageProjectRunnerItem) => {
    if (item.domain) {
      const protocol = item.useSSL ? 'https' : 'http'
      const port = item.useSSL
        ? item.projectPort === 443
          ? ''
          : `:${item.projectPort}`
        : item.projectPort === 80
          ? ''
          : `:${item.projectPort}`
      return `${protocol}://${item.domain}${port}`
    }
    return `http://127.0.0.1:${item.projectPort}`
  }

  const openSite = (item: LanguageProjectRunnerItem) => {
    const url = getSiteUrl(item)
    shell.openExternal(url)
  }

  const serviceDo = async (
    action: 'start' | 'stop' | 'restart',
    item: LanguageProjectRunnerItem
  ) => {
    if (action === 'start') {
      await item.start()
    } else if (action === 'stop') {
      await item.stop()
    } else if (action === 'restart') {
      await item.stop()
      await item.start()
    }
  }

  let EditVM: any
  import('./ProjectEdit.vue').then((res) => {
    EditVM = res.default
  })

  let ConfigVM: any
  import('./ConfigViewer.vue').then((res) => {
    ConfigVM = res.default
  })

  let LogVM: any
  import('./LogViewer.vue').then((res) => {
    LogVM = res.default
  })

  let LinkVM: any
  import('../Host/Link.vue').then((res) => {
    LinkVM = res.default
  })

  const action = (item: LanguageProjectRunnerItem, flag: string) => {
    switch (flag) {
      case 'open':
        shell.openPath(item.path)
        break
      case 'edit':
        emit('edit', item)
        break
      case 'config':
        if (item.configPath?.length) {
          AsyncComponentShow(ConfigVM, {
            configs: item.configPath
          }).then()
        }
        break
      case 'log':
        if (item.logPath?.length) {
          AsyncComponentShow(LogVM, {
            logs: item.logPath
          }).then()
        }
        break
      case 'del':
        Base._Confirm(I18nT('base.areYouSure'), undefined, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            emit('del', item.id)
          })
          .catch(() => {})
        break
      case 'link':
        AsyncComponentShow(LinkVM, {
          host: {
            id: item.id,
            name: item.domain || `127.0.0.1:${item.projectPort}`,
            root: item.path
          }
        }).then()
        break
    }
  }

  onMounted(() => {})
  onBeforeUnmount(() => {})
</script>

<style lang="scss">
  .run-project-list {
    .status {
      &.running {
        color: #f56c6c;
      }
      &.start {
        color: #67c23a;
      }
    }
  }
</style>
