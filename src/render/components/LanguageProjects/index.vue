<template>
  <div class="h-full overflow-hidden">
    <!-- 项目目录列表 -->
    <el-card class="version-manager">
      <template #header>
        <div class="card-header">
          <div class="left">
            <span class="break-keep flex-shrink-0"> {{ title }} </span>
            <el-input
              v-model="project.search"
              clearable
              class="ml-4"
              size="small"
              :placeholder="I18nT('common.action.search')"
            ></el-input>
          </div>
          <div class="flex items-center gap-2">
            <template v-if="isLock">
              <el-tooltip placement="right" :content="I18nT('host.licenseTips')">
                <el-button link @click="toLicense">
                  <Lock class="w-[24px] h-[24px] p-[2px]" />
                </el-button>
              </el-tooltip>
            </template>
            <template v-else>
              <slot name="header-actions" />
              <el-button link @click.stop="project.addProject()">
                <FolderAdd class="w-[24px] h-[24px] p-[2px]"></FolderAdd>
              </el-button>
            </template>
          </div>
        </div>
      </template>
      <el-table
        ref="nodeProjectList"
        v-loading="project?.fetching"
        :show-overflow-tooltip="true"
        class="service-table"
        :data="tableData"
        :row-class-name="tableRowClassName"
      >
        <el-table-column prop="path">
          <template #header>
            <span class="truncate" style="padding: 2px 12px 2px 24px; display: block">{{
              I18nT('common.label.path')
            }}</span>
          </template>
          <template #default="scope">
            <span
              style="padding: 2px 12px 2px 24px"
              class="truncate cursor-pointer hover:text-yellow-500 project-list-cell-id"
              :data-project-id="scope.row.id"
              @click.stop="shell.openPath(scope.row.path)"
              >{{ scope.row.path }}</span
            >
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('base.links')" width="300px">
          <template #default="scope">
            <template v-if="scope.row.isService">
              <template
                v-if="!scope?.row?.deling && quickEdit?.id && scope.row.id === quickEdit?.id"
              >
                <span>{{ projectPortUrl(parseProjectPort(quickEditPortInput)) || '-' }}</span>
              </template>
              <template v-else>
                <div class="flex items-center gap-2">
                  <div
                    v-if="projectPorts.get(scope.row.id)?.primaryUrl"
                    class="flex items-center gap-2 cursor-pointer"
                    :class="{
                      'hover:text-yellow-500': !scope.row?.state?.isRun,
                      'text-green-500': scope.row?.state?.isRun
                    }"
                    @click.stop="openSite(scope.row)"
                  >
                    <yb-icon
                      :class="{ active: scope.row?.state?.isRun }"
                      :svg="import('@/svg/link.svg?raw')"
                      width="18"
                      height="18"
                    />
                    <span>{{ projectPorts.get(scope.row.id)?.primaryUrl }}</span>
                  </div>
                  <span v-else class="text-xs opacity-70">
                    {{ I18nT('host.projectPortUnavailable') }}
                  </span>
                  <el-dropdown
                    v-if="projectPorts.get(scope.row.id)?.additionalPorts.length"
                    trigger="click"
                    @command="openSite(scope.row, $event)"
                  >
                    <el-button
                      link
                      type="primary"
                      :aria-label="I18nT('host.additionalProjectPorts')"
                      @click.stop
                      @dblclick.stop
                    >
                      +{{ projectPorts.get(scope.row.id)?.additionalPorts.length }}
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          v-for="port in projectPorts.get(scope.row.id)?.additionalPorts"
                          :key="port"
                          :command="port"
                        >
                          {{ projectPortUrl(port) }}
                        </el-dropdown-item>
                        <el-dropdown-item disabled class="max-w-xs whitespace-normal">
                          {{ I18nT('host.projectPortsHint') }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                  <el-tooltip
                    v-if="projectPorts.get(scope.row.id)?.hasInvalidPorts"
                    :content="I18nT('host.projectPortsStoredInvalid')"
                  >
                    <el-tag
                      type="warning"
                      size="small"
                      tabindex="0"
                      :aria-label="I18nT('host.projectPortsStoredInvalid')"
                      >!</el-tag
                    >
                  </el-tooltip>
                </div>
              </template>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('common.label.port')" width="100px">
          <template #default="scope">
            <template v-if="scope.row.isService">
              <template v-if="scope.row.id === quickEdit?.id">
                <el-input
                  v-model="quickEditPortInput"
                  type="text"
                  inputmode="numeric"
                  :class="{ error: quickEditPortsInvalid }"
                  @input="onQuickEditPortInput"
                  @change="docClick(undefined)"
                  @keydown.esc.stop="cancelQuickEdit"
                ></el-input>
              </template>
              <template v-else>
                <span>{{ scope.row.projectPort }}</span>
              </template>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('base.version')" :prop="null" width="160px">
          <template #default="scope">
            <template v-if="quickEdit?.id === scope.row.id">
              <el-select v-model="quickEdit!.binBin">
                <el-option :value="''" :label="I18nT('host.useSysVersion')"></el-option>
                <template v-for="(n, _i) in binVersions" :key="_i">
                  <el-option :value="n.bin" :label="`${n.version}-${n.bin}`"></el-option>
                </template>
              </el-select>
            </template>
            <template v-else>
              <span class="cursor-pointer hover:text-yellow-500">
                {{ scope.row.binVersion }}
              </span>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('common.label.comment')" prop="comment">
          <template #header>
            <span class="truncate">{{ I18nT('common.label.comment') }}</span>
          </template>
          <template #default="scope">
            <template v-if="scope.row.id === quickEdit?.id">
              <el-input v-model="quickEdit!.comment" @change="docClick(undefined)"></el-input>
            </template>
            <template v-else>
              <template v-if="!scope.row.comment && !scope.row?.state?.running">
                <span class="truncate row-hover-show text-yellow-500">
                  {{ I18nT('host.dbclickRowToEdit') }}
                </span>
              </template>
              <template v-else-if="!!scope.row.comment">
                <el-popover width="auto" :show-after="800" placement="top">
                  <template #default>
                    <span>{{ scope.row.comment }}</span>
                  </template>
                  <template #reference>
                    <span class="truncate">
                      {{ scope.row.comment }}
                    </span>
                  </template>
                </el-popover>
              </template>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('base.service')" :prop="null" width="110px">
          <template #default="scope">
            <template
              v-if="scope.row.isService && !scope?.row?.deling && quickEdit?.id !== scope.row.id"
            >
              <template v-if="scope.row.state.running">
                <el-button :loading="true" link></el-button>
              </template>
              <template v-else>
                <template v-if="scope.row.state.isRun">
                  <el-button
                    link
                    class="status running"
                    :class="{ disabled: scope.row.state.running }"
                    @click.stop="scope.row.stop()"
                  >
                    <yb-icon :svg="import('@/svg/stop2.svg?raw')" />
                  </el-button>
                  <el-button
                    link
                    class="status refresh"
                    :class="{ disabled: scope.row.state.running }"
                    @click.stop="scope.row.restart()"
                  >
                    <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" />
                  </el-button>
                </template>
                <template v-else>
                  <el-button
                    link
                    class="status start"
                    :class="{
                      disabled: scope.row.state.running
                    }"
                    @click.stop="scope.row.start()"
                  >
                    <yb-icon :svg="import('@/svg/play.svg?raw')" />
                  </el-button>
                </template>
              </template>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('base.operation')" :prop="null" width="110px" align="center">
          <template #header>
            <span class="truncate">{{ I18nT('base.operation') }}</span>
          </template>
          <template #default="scope">
            <el-popover
              effect="dark"
              popper-class="host-list-poper"
              placement="left-start"
              width="auto"
              :show-arrow="false"
            >
              <ul v-poper-fix class="host-list-menu">
                <li @click.stop="project.action(scope.row, scope.$index, 'open')">
                  <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('base.open') }}</span>
                </li>
                <li
                  v-if="!props.hideDefaultEdit"
                  @click.stop="project.action(scope.row, scope.$index, 'edit')"
                >
                  <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('common.action.edit') }}</span>
                </li>
                <slot name="operation" :row="scope.row as ProjectItem"></slot>
                <li
                  v-if="scope.row.isService"
                  :class="{
                    'cursor-not-allowed disabled': scope.row.state.running || scope.row.state.isRun
                  }"
                  @click.stop="
                    scope.row.state.running || scope.row.state.isRun
                      ? null
                      : scope.row.start(true, true)
                  "
                >
                  <yb-icon
                    :class="{
                      'opacity-60': scope.row.state.running || scope.row.state.isRun
                    }"
                    :svg="import('@/svg/play.svg?raw')"
                    width="13"
                    height="13"
                  />
                  <span
                    :class="{
                      'opacity-60': scope.row.state.running || scope.row.state.isRun
                    }"
                    class="ml-3"
                    >{{ I18nT('host.runInTerminal') }}</span
                  >
                </li>
                <li @click.stop="showConfig(scope.row)">
                  <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('nodejs.projectEnvSet') }}</span>
                </li>
                <li @click.stop="Project.copyPath(scope.row.path)">
                  <yb-icon :svg="import('@/svg/dirPath.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('nodejs.copyDirPath') }}</span>
                </li>
                <li @click.stop="project.action(scope.row, scope.$index, 'log')">
                  <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('base.log') }}</span>
                </li>
                <li
                  v-if="scope.row.configPath.length > 0"
                  @click.stop="project.action(scope.row, scope.$index, 'config')"
                >
                  <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('base.configFile') }}</span>
                </li>
                <li v-if="isWindows" @click.stop="Project.openPath(scope.row.path, 'PowerShell')">
                  <yb-icon :svg="import('@/svg/terminal.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('nodejs.openIN') }} PowerShell</span>
                </li>
                <li v-if="isWindows" @click.stop="Project.openPath(scope.row.path, 'PowerShell7')">
                  <yb-icon :svg="import('@/svg/terminal.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('nodejs.openIN') }} PowerShell7+</span>
                </li>
                <li v-if="!isWindows" @click.stop="Project.openPath(scope.row.path, 'Terminal')">
                  <yb-icon :svg="import('@/svg/terminal.svg?raw')" width="13" height="13" />
                  <span class="ml-3"
                    >{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.Terminal') }}</span
                  >
                </li>
                <li @click.stop="Project.openPath(scope.row.path, 'VSCode')">
                  <yb-icon :svg="import('@/svg/vscode.svg?raw')" width="13" height="13" />
                  <span class="ml-3"
                    >{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.VSCode') }}</span
                  >
                </li>
                <li @click.stop="Project.openPath(scope.row.path, 'PhpStorm')">
                  <yb-icon :svg="import('@/svg/phpstorm.svg?raw')" width="13" height="13" />
                  <span class="ml-3"
                    >{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.PhpStorm') }}</span
                  >
                </li>
                <li @click.stop="Project.openPath(scope.row.path, 'WebStorm')">
                  <yb-icon :svg="import('@/svg/webstorm.svg?raw')" width="13" height="13" />
                  <span class="ml-3"
                    >{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.WebStorm') }}</span
                  >
                </li>
                <li @click.stop="Project.openPath(scope.row.path, 'Sublime')">
                  <yb-icon :svg="import('@/svg/sublime.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('nodejs.openIN') }} Sublime Text</span>
                </li>
                <slot name="openin" :row="scope.row as ProjectItem"></slot>
                <li @click.stop="showSort($event, scope.row.id)">
                  <yb-icon :svg="import('@/svg/sort.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('host.sort') }}</span>
                </li>
                <li @click.stop="project.delProject(scope.$index)">
                  <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('common.action.delete') }}</span>
                </li>
              </ul>

              <template #reference>
                <el-button :key="scope.row.id" link class="status">
                  <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                </el-button>
              </template>
            </el-popover>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, type Ref, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { ProjectSetup } from './setup'
  import { FolderAdd, Lock } from '@element-plus/icons-vue'
  import { BrewStore } from '@/store/brew'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { isEqual } from 'lodash-es'
  import { Project } from '@/util/Project'
  import type { AllAppModule } from '@/core/type'
  import { SetupStore } from '@/components/Setup/store'
  import Router from '@/router'
  import { AppStore } from '@/store/app'
  import { join } from '@/util/path-browserify'
  import { shell } from '@/util/NodeFn'
  import { ProjectItem } from '@/components/LanguageProjects/ProjectItem'
  import { MessageError } from '@/util/Element'
  import {
    inspectProjectPorts,
    parseProjectPort,
    projectPortUrl,
    validateProjectPorts
  } from './ports'

  const props = defineProps<{
    typeFlag: AllAppModule
    title: string
    showRunTab?: boolean
    hideDefaultEdit?: boolean
  }>()

  const isWindows = computed(() => {
    return window.Server.isWindows
  })

  let quickEditBack: ProjectItem | undefined = undefined
  const quickEdit: Ref<ProjectItem | undefined> = ref(undefined)
  const quickEditTr: Ref<HTMLElement | undefined> = ref(undefined)
  const quickEditPortInput = ref('')
  const quickEditPortEdited = ref(false)
  const quickEditPortsInvalid = ref(false)

  const nodeProjectList = ref()
  const brewStore = BrewStore()

  const binVersions = computed(() => {
    return brewStore
      .module(props.typeFlag)
      .installed.map((p) => {
        return {
          ...p,
          bin: props.typeFlag === 'php' ? (p?.phpBin ?? join(p.path, 'bin/php')) : p.bin
        }
      })
      .filter((p) => p.version && p.bin && p.enable !== false)
  })

  const openSite = (item: ProjectItem, port?: unknown) => {
    const ports = inspectProjectPorts(item)
    if (port !== undefined && (typeof port !== 'number' || !ports.additionalPorts.includes(port))) {
      return
    }
    const url = port === undefined ? ports.primaryUrl : projectPortUrl(port)
    if (url) shell.openExternal(url).catch()
  }

  const project = ProjectSetup(props.typeFlag)
  const projectPorts = computed(
    () => new Map(project.project.map((item) => [item.id, inspectProjectPorts(item)]))
  )

  const appStore = AppStore()
  const setupStore = SetupStore()

  const isLock = computed(() => {
    return !setupStore.isActive && project.project.length > 2
  })

  const toLicense = () => {
    setupStore.tab = 'licenses'
    appStore.currentPage = '/setup'
    Router.push({
      path: '/setup'
    })
      .then()
      .catch()
  }

  const tableData = computed(() => {
    const search = project.search.trim()
    if (!search) {
      return project.project
    }
    return project.project.filter(
      (p: ProjectItem) =>
        p.path.includes(search) || p.comment.includes(search) || p.binVersion.includes(search)
    )
  })

  const tableRowClassName = ({ row }: { row: ProjectItem }) => {
    if (row?.isSorting) {
      return 'is-sorting'
    }
    return ''
  }

  let SortVM: any
  import('./sort.vue').then((res) => {
    SortVM = res.default
  })

  const showSort = (event: MouseEvent, id: string) => {
    let dom: HTMLElement = event.target as any
    while (dom.tagName.toUpperCase() !== 'LI' && dom.parentElement && dom.parentElement !== dom) {
      dom = dom.parentElement
    }
    const rect = dom.getBoundingClientRect()
    AsyncComponentShow(SortVM, {
      id: id,
      rect,
      typeFlag: props.typeFlag
    }).then()
  }

  let ConfigVM: any
  import('./config.vue').then((res) => {
    ConfigVM = res.default
  })

  const showConfig = (item: ProjectItem) => {
    AsyncComponentShow(ConfigVM, {
      file: join(item.path, '.flyenv'),
      fileExt: 'ps1',
      typeFlag: props.typeFlag
    }).then()
  }

  const tbodyDblClick = (e: MouseEvent) => {
    console.log('tbodyDblClick: ', e, e.target)
    let node: HTMLElement = e.target as any
    while (node.nodeName.toLowerCase() !== 'tr') {
      node = node.parentNode as any
    }
    console.log('tr: ', node)
    const idDom: HTMLElement = node.querySelector('.project-list-cell-id') as any
    const id = idDom.getAttribute('data-project-id') ?? ''
    const item = project.project.find((h) => `${h.id}` === `${id}`)
    if (item?.state?.running) {
      return
    }
    quickEdit.value = JSON.parse(JSON.stringify(item))
    quickEditPortInput.value = String(item?.projectPort ?? '')
    quickEditPortEdited.value = false
    quickEditPortsInvalid.value = false
    quickEditTr.value = node as any
    quickEditBack = JSON.parse(JSON.stringify(item))
  }

  const onQuickEditPortInput = () => {
    quickEditPortEdited.value = true
    quickEditPortsInvalid.value = false
  }

  const cancelQuickEdit = () => {
    quickEdit.value = undefined
    quickEditTr.value = undefined
    quickEditBack = undefined
    quickEditPortInput.value = ''
    quickEditPortEdited.value = false
    quickEditPortsInvalid.value = false
  }

  const docClick = (e?: MouseEvent) => {
    const dom: HTMLElement = e?.target as any
    if (quickEdit?.value && !quickEditTr?.value?.contains(dom)) {
      const portChanged =
        quickEditPortEdited.value &&
        parseProjectPort(quickEditPortInput.value) !== quickEditBack?.projectPort
      if (isEqual(quickEdit.value, quickEditBack) && !portChanged) {
        cancelQuickEdit()
        return
      }
      if (quickEdit.value.isService) {
        const projectPort = quickEditPortEdited.value
          ? parseProjectPort(quickEditPortInput.value)
          : quickEdit.value.projectPort
        const ports = validateProjectPorts(projectPort, quickEdit.value.additionalProjectPorts)
        const invalid =
          !ports.valid ||
          inspectProjectPorts({
            projectPort,
            additionalProjectPorts: quickEdit.value.additionalProjectPorts
          }).hasInvalidPorts
        if (invalid) {
          if (!quickEditPortsInvalid.value) MessageError(I18nT('host.projectPortsInvalid'))
          quickEditPortsInvalid.value = true
          return
        }
        quickEditPortsInvalid.value = false
        quickEdit.value.projectPort = ports.projectPort!
      }
      if (!isEqual(quickEdit.value, quickEditBack)) {
        const item = JSON.parse(JSON.stringify(quickEdit.value))
        cancelQuickEdit()
        nextTick().then(() => {
          const findNode = binVersions.value.find((n) => n.bin === item.binBin)
          const find = project.project.find((p) => p.path === item.path)
          if (find) {
            item.binVersion = findNode?.version ?? ''
            item.binPath = findNode?.path ?? ''
            item.binBin = findNode?.bin ?? ''

            const nodeChanged = find.binBin !== item.binBin
            const needRestart =
              (find.binBin !== item.binBin || find.projectPort !== item.projectPort) &&
              find.state?.isRun

            find.binBin = item.binBin
            find.binPath = item.binPath
            find.binVersion = item.binVersion
            find.projectPort = item.projectPort
            find.comment = item.comment

            project.prepareProject(find)
            project.saveProject()

            if (needRestart) {
              find
                .stop()
                .then(() => find.start())
                .catch()
            }
            if (nodeChanged || ['roadrunner', 'swoole-cli'].includes(props.typeFlag)) {
              project.setDirEnv(find).then().catch()
            }
          }
        })
      } else {
        cancelQuickEdit()
      }
    }
  }

  onMounted(() => {
    document.addEventListener('click', docClick)
    nextTick().then(() => {
      const list: HTMLElement = nodeProjectList?.value?.$el as any
      const tbody = list.querySelector('tbody')
      tbody?.addEventListener('dblclick', tbodyDblClick)
    })
  })
  onBeforeUnmount(() => {
    document.removeEventListener('click', docClick)
    const list: HTMLElement = nodeProjectList?.value?.$el as any
    const tbody = list.querySelector('tbody')
    tbody?.removeEventListener('dblclick', tbodyDblClick)
  })
</script>
