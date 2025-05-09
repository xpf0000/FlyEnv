<template>
  <div class="host-edit tools site-sucker">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolSiteSucker') }}</span>
        <slot name="like"></slot>
      </div>
      <yb-icon :svg="import('@/svg/setup.svg?raw')" width="24" height="24" @click.stop="toSet" />
    </div>

    <div class="main-wapper pb-0">
      <div class="main p-0">
        <div class="top-tool">
          <el-input
            v-model="url"
            placeholder="URL"
            class="input-with-select"
            :readonly="task.state === 'running'"
            :disabled="task.state === 'running'"
          ></el-input>
          <el-button-group style="flex-shrink: 0">
            <el-button
              :loading="task.state === 'running'"
              :disabled="!url || task.state === 'running'"
              @click="doRun"
            >
              <template v-if="task.state === 'stop'">
                <yb-icon :svg="import('@/svg/play.svg?raw')" width="18" height="18" />
              </template>
            </el-button>
          </el-button-group>
        </div>
        <div class="table-wapper">
          <el-auto-resizer>
            <template #default="{ height, width }">
              <el-table-v2
                :row-height="42"
                :columns="columns"
                :data="links"
                :width="width"
                :height="height"
                fixed
              />
            </template>
          </el-auto-resizer>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="tsx" setup>
  import { ref, computed } from 'vue'
  import { SiteSuckerStore } from './store'
  import { Loading, Check, Warning } from '@element-plus/icons-vue'
  import { ElIcon } from 'element-plus'
  import type { Column } from 'element-plus'
  import { AsyncComponentShow, waitTime } from '../../../fn'

  const emit = defineEmits(['doClose'])
  const siteStore = SiteSuckerStore()
  siteStore.initSetup()
  const links = computed(() => {
    const fails = siteStore.links.filter((f) => f.state === 'fail')
    const other = siteStore.links.filter((f) => f.state !== 'fail')
    return [...fails, ...other]
  })

  const url = ref('')

  const task = computed(() => {
    return siteStore.task
  })

  url.value = task.value.url

  const columns: Column<any>[] = [
    {
      key: 'url',
      title: 'url',
      dataKey: 'url',
      width: 150,
      class: 'url-column',
      headerClass: 'url-column',
      cellRenderer: ({ cellData: url }) => <span class="flex items-center">{url}</span>,
      headerCellRenderer: () => {
        const count = links.value.length
        const success = links.value.filter(
          (f) => f.state === 'replace' || f.state === 'success'
        ).length
        return (
          <span class="flex items-center">
            url({success}/{count})
          </span>
        )
      }
    },
    {
      key: 'state',
      title: 'state',
      dataKey: 'state',
      width: 100,
      align: 'center',
      cellRenderer: ({ cellData: state }) => {
        if (state === 'fail') {
          return (
            <ElIcon color="#F56C6C">
              <Warning />
            </ElIcon>
          )
        } else if (state === 'replace' || state === 'success') {
          return (
            <ElIcon color="#67C23A">
              <Check />
            </ElIcon>
          )
        } else {
          return (
            <ElIcon>
              <Loading />
            </ElIcon>
          )
        }
      }
    }
  ]

  const doClose = () => {
    emit('doClose')
  }

  const doRun = () => {
    if (task.value.state !== 'stop') {
      return
    }
    if (!siteStore?.commonSetup?.dir) {
      toSet()
      return
    }
    siteStore.task.url = url.value
    siteStore.task.state = 'running'
    siteStore.links.splice(0)
    waitTime().then(() => {
      siteStore.task.state = 'stop'
    })
  }

  const toSet = () => {
    import('./setup.vue').then((res) => {
      AsyncComponentShow(res.default).then()
    })
  }

  defineExpose({
    Loading
  })
</script>
