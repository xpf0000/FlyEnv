<template>
  <template v-if="OllamaAllModelsSetup.installing">
    <div class="w-full h-full overflow-hidden p-5">
      <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
    </div>
  </template>
  <template v-else>
    <el-auto-resizer>
      <template #default="{ height, width }">
        <el-table-v2
          class="app-el-table-v2"
          :columns="columns"
          :data="tableData"
          :width="width"
          :height="height"
          :header-height="59"
          :row-height="59"
          :row-key="'name'"
          expand-column-key="name"
          :expanded-row-keys="expandedRowKeys"
          @expanded-rows-change="onExpandedRowsChange"
        >
          <template #empty>
            <div class="w-full h-full flex items-center justify-center">
              <template v-if="fetching">
                {{ I18nT('base.gettingVersion') }}
              </template>
              <template v-else>
                {{ I18nT('util.noVerionsFoundInLib') }}
              </template>
            </div>
          </template>
        </el-table-v2>
      </template>
    </el-auto-resizer>
  </template>
</template>

<script lang="tsx" setup>
  import { I18nT } from '@lang/index'
  import { OllamaAllModelsSetup, Setup } from './setup'
  import { OllamaLocalModelsSetup } from '@/components/Ollama/models/local/setup'
  import { Download, Delete } from '@element-plus/icons-vue'
  import { type Column, ElButton, ElInput, ElTag, ElTooltip } from 'element-plus'

  const {
    xtermDom,
    fetching,
    tableData,
    expandedRowKeys,
    handleBrewVersion,
    fetchCommand,
    copyCommand,
    runningService,
    onExpandedRowsChange,
    getModelSizeColor
  } = Setup()

  const isInstalled = (row: any) => {
    return OllamaLocalModelsSetup.list.some((l) => l.name === row.name)
  }

  const columns: Column<any>[] = [
    {
      key: 'name',
      title: I18nT('base.Library'),
      dataKey: 'name',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      flexGrow: 1,
      headerCellRenderer: () => {
        return (
          <div class="w-full name-cell">
            <span style="display: inline-flex; align-items: center; padding: 2px 0">
              {I18nT('base.Library')}
            </span>
            <ElInput
              v-model={OllamaAllModelsSetup.search}
              placeholder={I18nT('common.action.search')}
              clearable={true}
            ></ElInput>
          </div>
        )
      },
      cellRenderer: ({ rowData: row }) => {
        return (
          <ElTooltip content={fetchCommand(row)} show-after={600} placement="top">
            {{
              default: () => {
                return (
                  <span
                    style="padding: 2px 12px"
                    class="hover:text-yellow-500 cursor-pointer truncate"
                    onClick={() => {
                      copyCommand(row)
                    }}
                  >
                    {row.name}
                  </span>
                )
              }
            }}
          </ElTooltip>
        )
      }
    },
    {
      key: 'size',
      title: I18nT('ollama.size'),
      dataKey: 'size',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 150,
      cellRenderer: ({ rowData: row }) => {
        const color = getModelSizeColor(row.size)
        if (!color) {
          return <span>{row.size}</span>
        }
        return (
          <ElTag size="small" type={color} effect="plain">
            {row.size}
          </ElTag>
        )
      }
    },
    {
      key: 'isInstalled',
      title: I18nT('base.isInstalled'),
      dataKey: 'isInstalled',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 120,
      align: 'center',
      cellRenderer: ({ rowData: row }) => {
        if (isInstalled(row)) {
          return <YbIcon class="installed" svg={import('@/svg/ok.svg?raw')}></YbIcon>
        }
        return <span></span>
      }
    },
    {
      key: 'operation',
      title: I18nT('common.label.action'),
      dataKey: 'operation',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 120,
      align: 'center',
      cellRenderer: ({ rowData: row }) => {
        if (row.isRoot) {
          return <span></span>
        }
        if (isInstalled(row)) {
          return (
            <ElButton
              type={runningService.value ? 'primary' : 'info'}
              link
              disabled={OllamaAllModelsSetup.installing}
              icon={Delete}
              onClick={() => {
                handleBrewVersion(row)
              }}
            ></ElButton>
          )
        }
        return (
          <ElButton
            type={runningService.value ? 'primary' : 'info'}
            link
            disabled={OllamaAllModelsSetup.installing}
            icon={Download}
            onClick={() => {
              handleBrewVersion(row)
            }}
          ></ElButton>
        )
      }
    }
  ]
</script>
