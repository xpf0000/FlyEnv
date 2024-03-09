<template>
  <div class="host-edit site-sucker">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">{{ $t('util.toolSiteSucker') }}</span>
      </div>
      <yb-icon :svg="import('@/svg/setup.svg?raw')" width="24" height="24" @click.stop="toSet" />
    </div>

    <div class="main-wapper">
      <div class="main">
        <div class="top-tool">
          <el-input
            v-model="url"
            placeholder="url link"
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
          <div class="url-block">
            <el-auto-resizer>
              <template #default="{ height, width }">
                <el-table-v2
                  :row-height="55"
                  :header-height="55"
                  :columns="columns"
                  :data="links"
                  :width="width"
                  :height="height"
                  fixed
                />
              </template>
            </el-auto-resizer>
          </div>
          <div class="host-block">
            <el-auto-resizer>
              <template #default="{ height, width }">
                <el-table-v2
                  :row-height="55"
                  :header-height="55"
                  :columns="columnsHost"
                  :data="hosts"
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
  </div>
</template>

<script lang="tsx" setup>
  import { ref, computed } from 'vue'
  import IPC from '@/util/IPC'
  import { SiteSuckerStore } from '@/components/Tools/SiteSucker/store'
  import { Loading, Check, Warning } from '@element-plus/icons-vue'
  import { ElIcon } from 'element-plus'
  import type { Column } from 'element-plus'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { ElInput } from 'element-plus'

  const emit = defineEmits(['doClose'])
  const siteStore = SiteSuckerStore()
  siteStore.initSetup()
  const links = computed(() => {
    const fails = siteStore.links.filter((f) => f.state === 'fail')
    const wait = siteStore.links.filter((f) => f.state === 'wait')
    const running = siteStore.links.filter((f) => f.state === 'running')
    const other = siteStore.links.filter((f) => !['fail', 'wait', 'running'].includes(f.state))
    return [...fails, ...wait, ...running, ...other]
  })

  const hosts = computed(() => {
    const host = new Set()
    siteStore.links.forEach((s) => {
      const url = new URL(s.url)
      host.add(url.host)
    })
    return Array.from(host).map((h) => {
      return {
        host: h
      }
    })
  })

  const url = ref('')
  const search = ref('')
  const searchHost = ref('')

  const task = computed(() => {
    return siteStore.task
  })

  url.value = task.value.url

  const excludeLink = computed(() => {
    return (
      siteStore?.commonSetup?.excludeLink
        ?.split('\n')
        ?.map((s) => s.trim())
        .filter((s) => !!s) ?? []
    )
  })

  const allowChange = (host: string) => {
    const ex = new Set(excludeLink.value)
    if (ex.has(host)) {
      ex.delete(host)
    } else {
      ex.add(host)
    }
    siteStore.commonSetup.excludeLink = Array.from(ex).join('\n')
  }

  const columns: Column<any>[] = [
    {
      key: 'url',
      title: 'url',
      dataKey: 'url',
      width: 150,
      class: 'url-column',
      headerClass: 'url-column',
      cellRenderer: ({ cellData: url }) => (
        <span class="flex items-center" style="padding-left: 24px">
          {url}
        </span>
      ),
      headerCellRenderer: () => {
        const count = links.value.length
        const success = links.value.filter(
          (f) => f.state === 'replace' || f.state === 'success'
        ).length
        return (
          <div class="wapper">
            <span class="flex items-center">
              url({success}/{count})
            </span>
            <ElInput v-model={search.value} placeholder="search"></ElInput>
          </div>
        )
      }
    },
    {
      key: 'state',
      title: 'state',
      dataKey: 'state',
      width: 140,
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

  const columnsHost: Column<any>[] = [
    {
      key: 'host',
      title: 'host',
      dataKey: 'host',
      width: 150,
      class: 'url-column',
      headerClass: 'url-column',
      cellRenderer: ({ cellData: host }) => {
        const filter = links.value.filter((u) => {
          const url = new URL(u.url)
          return url.host === host
        })
        const count = filter.length
        const success = filter.filter((f) => f.state === 'replace' || f.state === 'success').length
        return (
          <span class="flex items-center" style="padding-left: 24px">
            {host} ({success}/{count})
          </span>
        )
      },
      headerCellRenderer: () => {
        return (
          <div class="wapper">
            <span class="flex items-center">host</span>
            <ElInput v-model={searchHost.value} placeholder="search"></ElInput>
          </div>
        )
      }
    },
    {
      key: 'allow',
      title: 'allow',
      dataKey: 'host',
      width: 140,
      class: 'host-allow',
      align: 'center',
      cellRenderer: ({ cellData: host }) => {
        const c = excludeLink.value.includes(host) ? 'not-allow' : 'allow'
        return (
          <ElIcon class={c} onClick={() => allowChange(host)}>
            <Check />
          </ElIcon>
        )
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
    const item = JSON.parse(
      JSON.stringify({
        url: url.value,
        config: siteStore.commonSetup
      })
    )
    siteStore.task.url = url.value
    siteStore.task.state = 'running'
    siteStore.links.splice(0)
    IPC.send('app-sitesucker-run', item).then((key: string, res: any) => {
      console.log(res)
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
