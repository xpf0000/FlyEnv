<template>
  <div v-if="showChannelTabs" class="py-3 pl-3">
    <el-radio-group v-model="channelTab" size="small">
      <template v-for="item in channels" :key="item.value">
        <el-radio-button :value="item.value" :label="item.label" />
      </template>
    </el-radio-group>
  </div>
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
      >
        <template #empty>
          <div class="w-full h-full flex items-center justify-center p-8">
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

<script lang="tsx" setup>
  import { I18nT } from '@lang/index'
  import type { AllAppModule } from '@/core/type'
  import { Setup, StaticSetup } from './setup'
  import { computed } from 'vue'
  import { ElTooltip, ElProgress, ElButton } from 'element-plus'
  import type { Column } from 'element-plus'

  const props = defineProps<{
    typeFlag: AllAppModule
  }>()

  const showChannelTabs = computed(() => {
    return StaticSetup.channel.show?.[props.typeFlag]
  })

  const channelTab = computed({
    get() {
      return StaticSetup.channel.tab?.[props.typeFlag]
    },
    set(val) {
      StaticSetup.channel.tab[props.typeFlag] = val
    }
  })

  const channels = computed(() => {
    return StaticSetup.channel.channels?.[props.typeFlag] ?? []
  })

  const { fetching, tableData, handleVersion, fetchCommand, copyCommand } = Setup(props.typeFlag)

  const columns: Column<any>[] = [
    {
      key: 'name',
      title: I18nT('common.label.library'),
      dataKey: 'name',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      headerCellRenderer: () => {
        return (
          <span style="padding: 2px 12px 2px 24px; display: block">{I18nT('common.label.library')}</span>
        )
      },
      cellRenderer: ({ rowData: row }) => {
        return (
          <ElTooltip show-after={600} placement="top">
            {{
              content: () => <pre v-html={fetchCommand(row)}></pre>,
              default: () => (
                <div
                  style="padding: 2px 12px 2px 24px"
                  class="flex items-center overflow-hidden hover:text-yellow-500 cursor-pointer gap-2"
                  onClick={() => copyCommand(row)}
                >
                  <YbIcon
                    class="flex-shrink-0"
                    svg={import('@/svg/link.svg?raw')}
                    width="18"
                    height="18"
                  />
                  <span class="truncate">{row.name}</span>
                </div>
              )
            }}
          </ElTooltip>
        )
      }
    },
    {
      key: 'progress',
      title: '',
      dataKey: 'progress',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      cellRenderer: ({ rowData: row }) => {
        if (row.downing) {
          return (
            <div class="cell-progress w-full">
              <ElProgress class="w-full" percentage={row.progress}></ElProgress>
            </div>
          )
        }
        return <span></span>
      }
    },
    {
      key: 'version',
      title: I18nT('base.version'),
      dataKey: 'version',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 200,
      cellRenderer: ({ rowData: row }) => {
        return <span class="truncate">{row.version}</span>
      }
    },
    {
      key: 'installed',
      title: I18nT('base.isInstalled'),
      dataKey: 'installed',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 120,
      align: 'center',
      cellRenderer: ({ rowData: row }) => {
        if (row.installed) {
          return (
            <div class="cell-status">
              <YbIcon class="installed" svg={import('@/svg/ok.svg?raw')}></YbIcon>
            </div>
          )
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
        return (
          <ElButton
            type="primary"
            link
            style={{ opacity: row.version !== undefined ? 1 : 0 }}
            loading={row.downing}
            disabled={row.downing}
            onClick={() => handleVersion(row)}
          >
            {row.installed ? I18nT('common.action.uninstall') : I18nT('base.install')}
          </ElButton>
        )
      }
    }
  ]
</script>
<style lang="scss">
  .app-html-block {
    a {
      color: #4096ff;
    }
  }
</style>
