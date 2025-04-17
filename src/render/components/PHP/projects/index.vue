<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span class="break-keep flex-shrink-0"> {{ title }} </span>
          <template v-if="isLock">
            <el-tooltip placement="right" :content="I18nT('host.licenseTips')">
              <el-button
                class="custom-folder-add-btn"
                :icon="Lock"
                link
                @click="toLicense"
              ></el-button>
            </el-tooltip>
          </template>
          <template v-else>
            <el-button
              class="custom-folder-add-btn"
              :icon="FolderAdd"
              link
              @click.stop="project.addProject"
            ></el-button>
          </template>
          <el-input
            v-model="project.search"
            clearable
            class="ml-4"
            size="small"
            :placeholder="I18nT('base.placeholderSearch')"
          ></el-input>
        </div>
        <el-button :disabled="project.fetching" link @click="project.fetchProject">
          <Refresh
            class="refresh-icon w-[24px] h-[24px]"
            :class="{ 'fa-spin': project.fetching }"
          />
        </el-button>
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
          <span style="padding: 2px 12px 2px 24px; display: block">{{ I18nT('base.path') }}</span>
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
      <el-table-column :label="I18nT('host.comment')" prop="comment">
        <template #default="scope">
          <template v-if="scope.row.id === quickEdit?.id">
            <el-input v-model="quickEdit!.comment" @change="docClick(undefined)"></el-input>
          </template>
          <template v-else>
            <template v-if="!scope.row.comment">
              <span class="truncate row-hover-show text-yellow-500">
                {{ I18nT('host.dbclickRowToEdit') }}
              </span>
            </template>
            <template v-else>
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
      <el-table-column :label="I18nT('base.operation')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-popover
            ref="popper"
            effect="dark"
            popper-class="host-list-poper"
            placement="left-start"
            :show-arrow="false"
            width="auto"
          >
            <ul v-poper-fix class="host-list-menu">
              <slot name="operation" :row="scope.row as ProjectItem"></slot>
              <li @click.stop="showConfig(scope.row)">
                <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                <span class="ml-15"> {{ I18nT('nodejs.projectEnvSet') }} </span>
              </li>
              <li @click.stop="Project.copyPath(scope.row.path)">
                <yb-icon :svg="import('@/svg/dirPath.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ I18nT('nodejs.copyDirPath') }}</span>
              </li>
              <li @click.stop="Project.openPath(scope.row.path, 'Terminal')">
                <yb-icon :svg="import('@/svg/terminal.svg?raw')" width="13" height="13" />
                <span class="ml-15"
                  >{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.Terminal') }}</span
                >
              </li>
              <li @click.stop="Project.openPath(scope.row.path, 'VSCode')">
                <yb-icon :svg="import('@/svg/vscode.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.VSCode') }}</span>
              </li>
              <li @click.stop="Project.openPath(scope.row.path, 'PhpStorm')">
                <yb-icon :svg="import('@/svg/phpstorm.svg?raw')" width="13" height="13" />
                <span class="ml-15"
                  >{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.PhpStorm') }}</span
                >
              </li>
              <li @click.stop="Project.openPath(scope.row.path, 'WebStorm')">
                <yb-icon :svg="import('@/svg/webstorm.svg?raw')" width="13" height="13" />
                <span class="ml-15"
                  >{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.WebStorm') }}</span
                >
              </li>
              <li @click.stop="Project.openPath(scope.row.path, 'Sublime')">
                <yb-icon :svg="import('@/svg/sublime.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ I18nT('nodejs.openIN') }} Sublime Text</span>
              </li>
              <li @click.stop="Project.openPath(scope.row.path, 'HBuilderX')">
                <yb-icon :svg="import('@/svg/hbuilderx.svg?raw')" width="13" height="13" />
                <span class="ml-15"
                  >{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.HBuilderX') }}</span
                >
              </li>
              <slot name="openin" :row="scope.row as ProjectItem"></slot>
              <li @click.stop="showSort($event, scope.row.id)">
                <yb-icon :svg="import('@/svg/sort.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ I18nT('host.sort') }}</span>
              </li>
              <li @click.stop="project.delProject(scope.$index)">
                <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ I18nT('base.del') }}</span>
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
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, type Ref, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { type ProjectItem, ProjectSetup } from './setup'
  import { FolderAdd, Lock, Refresh } from '@element-plus/icons-vue'
  import { BrewStore } from '@/store/brew'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { isEqual } from 'lodash'
  import { Project } from '@/util/Project'
  import type { AllAppModule } from '@/core/type'
  import { SetupStore } from '@/components/Setup/store'
  import Router from '@/router'
  import { AppStore } from '@/store/app'

  const { shell } = require('@electron/remote')
  const { join } = require('path')

  const props = defineProps<{
    typeFlag: AllAppModule
    title: string
  }>()

  let quickEditBack: ProjectItem | undefined = undefined
  const quickEdit: Ref<ProjectItem | undefined> = ref(undefined)
  const quickEditTr: Ref<HTMLElement | undefined> = ref(undefined)

  const nodeProjectList = ref()
  const brewStore = BrewStore()

  const binVersions = computed(() => {
    return brewStore.module(props.typeFlag).installed.map((p) => {
      return {
        ...p,
        bin: props.typeFlag === 'php' ? (p?.phpBin ?? join(p.path, 'bin/php')) : p.bin
      }
    })
  })

  const project = ProjectSetup(props.typeFlag)

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
    quickEdit.value = JSON.parse(JSON.stringify(item))
    quickEditTr.value = node as any
    quickEditBack = JSON.parse(JSON.stringify(item))
  }

  const docClick = (e?: MouseEvent) => {
    const dom: HTMLElement = e?.target as any
    if (quickEdit?.value && !quickEditTr?.value?.contains(dom)) {
      if (!isEqual(quickEdit.value, quickEditBack)) {
        const item = JSON.parse(JSON.stringify(quickEdit.value))
        quickEdit.value = undefined
        quickEditTr.value = undefined
        quickEditBack = undefined
        nextTick().then(() => {
          const findNode = binVersions.value.find((n) => n.bin === item.binBin)
          const findProjectIndex = project.project.findIndex((p) => p.path === item.path)
          if (findProjectIndex >= 0) {
            item.binVersion = findNode?.version ?? ''
            item.binPath = findNode?.path ?? ''
            item.binBin = findNode?.bin ?? ''
            const nodeChanged = project.project[findProjectIndex].binBin !== item.binBin
            project.project.splice(findProjectIndex, 1, reactive(item))
            project.saveProject()
            if (nodeChanged) {
              project.setDirEnv(item).then().catch()
            }
          }
        })
      } else {
        quickEdit.value = undefined
        quickEditTr.value = undefined
        quickEditBack = undefined
      }
    }
  }

  project.fetchProject()

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
