<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>Slim Tunnel</span>
        </div>
        <el-button class="button" link :icon="Plus" @click="add" />
      </div>
    </template>

    <el-table class="service-table" :data="list" show-overflow-tooltip>
      <!-- Port -->
      <el-table-column :label="I18nT('host.slimTunnel.port')" prop="port" width="100px" />

      <!-- Subdomain -->
      <el-table-column :label="I18nT('host.slimTunnel.subdomain')" prop="subdomain" />

      <!-- Public URL -->
      <el-table-column :label="I18nT('host.slimTunnel.publicUrl')">
        <template #default="scope">
          <template v-if="scope.row.run && scope.row.publicUrl">
            <el-button type="success" link @click.stop="openUrl(scope.row.publicUrl)">
              {{ scope.row.publicUrl }}
            </el-button>
          </template>
          <template v-else>
            <span class="text-gray-400">—</span>
          </template>
        </template>
      </el-table-column>

      <!-- Service toggle -->
      <el-table-column :label="I18nT('base.service')" width="110px">
        <template #default="scope">
          <template v-if="scope.row.running">
            <el-button :loading="true" link />
          </template>
          <template v-else>
            <template v-if="scope.row.run">
              <el-button link class="status running">
                <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="scope.row.stop()" />
              </el-button>
              <el-button link class="status refresh">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  @click.stop="scope.row.restart()"
                />
              </el-button>
            </template>
            <template v-else>
              <el-button link class="status start">
                <yb-icon :svg="import('@/svg/play.svg?raw')" @click.stop="scope.row.start()" />
              </el-button>
            </template>
          </template>
        </template>
      </el-table-column>

      <!-- Actions -->
      <el-table-column align="center" :label="I18nT('host.action')" width="80px">
        <template #default="scope">
          <div class="w-full h-full flex items-center justify-center">
            <el-dropdown>
              <div class="flex items-center justify-center">
                <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click.stop="edit(scope.row)">
                    <div class="flex items-center">
                      <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                      <span class="ml-3">{{ I18nT('base.edit') }}</span>
                    </div>
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="del(scope.row, scope.$index)">
                    <div class="flex items-center">
                      <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                      <span class="ml-3">{{ I18nT('base.del') }}</span>
                    </div>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { Plus } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import SlimTunnelStore from '@/core/SlimTunnel/SlimTunnelStore'
  import Base from '@/core/Base'
  import { shell } from '@/util/NodeFn'
  import type { SlimTunnel } from '@/core/SlimTunnel/SlimTunnel'

  const list = computed(() => SlimTunnelStore.items)

  let AddVM: any
  import('./add.vue').then((res) => {
    AddVM = res.default
  })

  let EditVM: any
  import('./edit.vue').then((res) => {
    EditVM = res.default
  })

  const add = () => AsyncComponentShow(AddVM).then()

  const edit = (item: SlimTunnel) => {
    AsyncComponentShow(EditVM, { item: JSON.parse(JSON.stringify(item)) }).then()
  }

  const del = (item: SlimTunnel, index: number) => {
    Base._Confirm(I18nT('base.areYouSure'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    }).then(() => {
      if (item.run) item.stop()
      SlimTunnelStore.items.splice(index, 1)
      SlimTunnelStore.save()
    })
  }

  const openUrl = (url: string) => {
    shell.openExternal(url).catch()
  }
</script>
