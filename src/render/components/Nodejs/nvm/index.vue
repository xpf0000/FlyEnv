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
  import { NVMSetup, Setup } from './setup'
  import { type Column, ElButton, ElInput, ElTooltip } from 'element-plus'
  import { MessageSuccess } from '@/util/Element'

  const { clipboard } = require('@electron/remote')

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
          <div class="w-p100 name-cell">
            <span style="display: inline-flex; align-items: center; padding: 2px 0">
              {I18nT('base.version')}
            </span>
            <ElInput v-model={NVMSetup.search} placeholder="search" clearable={true}></ElInput>
          </div>
        )
      },
      cellRenderer: ({ rowData: row }) => {
        const c = { current: NVMSetup.current === row.version, 'hover-yellow-500': !!row.installed }
        const tips = `nvm use ${row.version}`
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
        const isCurrent = NVMSetup.current === row.version
        if (isCurrent) {
          return (
            <ElButton link type="primary">
              <YbIcon class="current" svg={import('@/svg/select.svg?raw')} width="17" height="17" />
            </ElButton>
          )
        } else if (row.installed) {
          if (NVMSetup.switching === row.version) {
            return <ElButton loading={true} link></ElButton>
          } else if (!NVMSetup.switching) {
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
        }
        return <span></span>
      }
    },
    {
      key: 'operation',
      title: I18nT('base.operation'),
      dataKey: 'operation',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 140,
      align: 'center',
      cellRenderer: ({ rowData: row }) => {
        if (row.installing) {
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
