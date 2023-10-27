<template>
  <div class="ssl-make site-sucker">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
        <span class="ml-15">Site Sucker</span>
      </div>
      <yb-icon :svg="import('@/svg/setup.svg?raw')" width="24" height="24" />
    </div>

    <div class="main-wapper">
      <div class="main">
        <div class="top-tool">
          <el-input
            v-model="url"
            placeholder="Please input port"
            class="input-with-select"
          ></el-input>
          <el-button-group style="flex-shrink: 0">
            <el-button @click="doRun">
              <yb-icon :svg="import('@/svg/play.svg?raw')" width="18" height="18" />
            </el-button>
            <el-button>
              <yb-icon :svg="import('@/svg/stop.svg?raw')" width="18" height="18" />
            </el-button>
          </el-button-group>
        </div>
        <div class="table-wapper">
          <el-table height="100%" :data="links" size="default" style="width: 100%">
            <el-table-column prop="url" label="url"> </el-table-column>
            <el-table-column align="center" :label="$t('base.status')">
              <template #default="scope">
                <template v-if="scope.row.status === 'success' || scope.row.status === 'replace'">
                  <el-icon color="#67C23A"><Check /></el-icon>
                </template>
                <template v-else-if="scope.row.status === 'fail'">
                  <el-icon color="#F56C6C"><Warning /></el-icon>
                </template>
                <template v-else>
                  <el-icon><Loading /></el-icon>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, defineExpose } from 'vue'
  import IPC from '@/util/IPC'
  import { SiteSuckerStore } from '@/components/Tools/SiteSucker/store'
  import { Loading, Check, Warning } from '@element-plus/icons-vue'

  const emit = defineEmits(['doClose'])
  const siteStore = SiteSuckerStore()

  const links = computed(() => {
    return siteStore.links
  })

  const doClose = () => {
    emit('doClose')
  }

  const url = ref('')

  const doRun = () => {
    IPC.send('app-sitesucker-run', url.value).then((key: string, res: any) => {
      console.log(res)
    })
  }

  defineExpose({
    Loading
  })
</script>
<style lang="scss">
  .site-sucker {
    .main {
      height: 100%;
      display: flex;
      flex-direction: column;

      > .top-tool {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
        flex-shrink: 0;
      }

      > .table-wapper {
        flex: 1;
      }
    }
  }
</style>
