<template>
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
      />
    </template>
  </el-auto-resizer>
</template>

<script lang="tsx" setup>
  import { I18nT } from '@lang/index'
  import { NodeDefaultSetup, Setup } from './setup'
  import { ElInput, ElButton, ElTooltip, ElProgress } from 'element-plus'
  import type { Column } from 'element-plus'
  import { MessageSuccess } from '@/util/Element'
  import { join } from '@/util/path-browserify'
  import { clipboard } from '@/util/NodeFn'

  const { versionChange, installOrUninstall, tableData } = Setup()

  const copyCommand = (command: string) => {
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const columns: Column<any>[] = [
    {
      key: 'version',
      title: 'version',
      dataKey: 'version',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      headerCellRenderer: () => {
        return (
          <div class="w-full name-cell">
            <span style="display: inline-flex; align-items: center; padding: 2px 0">
              {I18nT('base.version')}
            </span>
            <ElInput
              v-model={NodeDefaultSetup.search}
              placeholder={I18nT('base.placeholderSearch')}
              clearable={true}
            ></ElInput>
          </div>
        )
      },
      cellRenderer: ({ rowData: row }) => {
        const c = {
          current: NodeDefaultSetup.current === row.version,
          'hover-yellow-500': !!row.installed
        }
        const path = join(window.Server.AppDir!, `nodejs/${row.version}/bin`)
        const tips = `export PATH="${path}:$PATH"`
        const disabled = !row.installed
        return (
          <ElTooltip disabled={disabled} content={tips} show-after={600} placement="top">
            {{
              default: () => {
                return (
                  <span
                    style="display: inline-flex; align-items: center; padding: 2px 12px; margin-left: 50px;"
                    class={c}
                    onClick={() => {
                      copyCommand(tips)
                    }}
                  >
                    {row.version}
                  </span>
                )
              }
            }}
          </ElTooltip>
        )
      }
    },
    {
      key: 'current',
      title: I18nT('util.nodeListCellCurrent'),
      dataKey: 'current',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      align: 'center',
      cellRenderer: ({ rowData: row }) => {
        const isCurrent = NodeDefaultSetup.current === row.version
        if (row.switching) {
          return <ElButton loading={true} link></ElButton>
        }
        if (isCurrent) {
          return (
            <ElButton
              link
              type="primary"
              onClick={() => {
                versionChange(row)
              }}
            >
              <YbIcon class="current" svg={import('@/svg/select.svg?raw')} width="17" height="17" />
            </ElButton>
          )
        } else if (row.installed) {
          if (!NodeDefaultSetup.switching) {
            return (
              <ElButton
                link
                class="current-set row-hover-show"
                onClick={() => {
                  versionChange(row)
                }}
              >
                <YbIcon
                  class="current-not"
                  svg={import('@/svg/select.svg?raw')}
                  width="17"
                  height="17"
                />
              </ElButton>
            )
          }
        }
        return <span></span>
      }
    },
    {
      key: 'installed',
      title: I18nT('util.nodeListCellInstalled'),
      dataKey: 'installed',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      align: 'center',
      cellRenderer: ({ rowData: row }) => {
        if (row.installed) {
          return (
            <ElButton link>
              <YbIcon
                class="installed"
                svg={import('@/svg/select.svg?raw')}
                width="17"
                height="17"
              />
            </ElButton>
          )
        } else if (NodeDefaultSetup.installing.hasOwnProperty(row.version)) {
          return <ElProgress class="w-full" percentage={NodeDefaultSetup.installing[row.version]} />
        }
        return <span></span>
      }
    },
    {
      key: 'operation',
      title: I18nT('base.action'),
      dataKey: 'operation',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 140,
      align: 'center',
      cellRenderer: ({ rowData: row }) => {
        if (NodeDefaultSetup.versionInstalling[row.version]) {
          return <ElButton loading={true} link></ElButton>
        } else {
          const t = row.installed ? I18nT('base.uninstall') : I18nT('base.install')
          const a = row.installed ? 'uninstall' : 'install'
          return (
            <ElButton
              type="primary"
              onClick={() => {
                installOrUninstall(a, row)
              }}
              link
            >
              {t}
            </ElButton>
          )
        }
      }
    }
  ]
</script>
<script setup lang="ts"></script>
