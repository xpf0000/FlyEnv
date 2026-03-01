<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> Cloudflare Tunnel </span>
        </div>
        <el-button class="button" link :icon="Plus" @click="add"> </el-button>
      </div>
    </template>
    <el-table default-expand-all class="service-table" :data="list" show-overflow-tooltip>
      <el-table-column type="expand">
        <template #default="props">
          <div class="pl-5">
            <div
              class="h-[58px] flex items-center gap-3 justify-between pr-[12px]"
              style="border-bottom: var(--el-table-border)"
            >
              <span>{{ I18nT('host.CloudflareTunnel.TunnelRule') }}</span>
              <el-button link :icon="Plus" @click.stop="addDNS(props.row)"></el-button>
            </div>
            <el-table :data="props.row.dns" show-overflow-tooltip>
              <el-table-column width="30px"></el-table-column>
              <el-table-column prop="out-url" :label="I18nT('host.OnlineDomain')">
                <template #default="scope">
                  <template v-if="scope.row.run">
                    <el-button type="success" link @click.stop="openOutUrl(scope.row)"
                      >{{ scope.row.subdomain }}.{{ scope.row.zoneName }}</el-button
                    >
                  </template>
                  <template v-else>
                    <el-button type="info" link
                      >{{ scope.row.subdomain }}.{{ scope.row.zoneName }}</el-button
                    >
                  </template>
                </template>
              </el-table-column>
              <el-table-column prop="local-url" :label="I18nT('host.LocalDoman')">
                <template #default="scope">
                  <template v-if="scope.row.run">
                    <el-button type="success" link @click.stop="openLocalUrl(scope.row)">{{
                      scope.row.localService
                    }}</el-button>
                  </template>
                  <template v-else>
                    <el-button type="info" link>{{ scope.row.localService }}</el-button>
                  </template>
                </template>
              </el-table-column>
              <el-table-column width="100px"></el-table-column>
              <el-table-column width="100px"></el-table-column>
              <el-table-column align="center" :label="I18nT('host.action')" width="100px">
                <template #default="scope">
                  <div class="w-full h-full flex items-center justify-center">
                    <el-dropdown class="h-full">
                      <template #default>
                        <div class="h-full w-full flex items-center justify-center">
                          <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                        </div>
                      </template>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item
                            @click.stop="dnsAction(props.row, scope.row, scope.$index, 'edit')"
                          >
                            <template #default>
                              <div class="flex items-center">
                                <yb-icon
                                  :svg="import('@/svg/edit.svg?raw')"
                                  width="13"
                                  height="13"
                                />
                                <span class="ml-3">{{ I18nT('base.edit') }}</span>
                              </div>
                            </template>
                          </el-dropdown-item>
                          <el-dropdown-item
                            @click.stop="dnsAction(props.row, scope.row, scope.$index, 'del')"
                          >
                            <template #default>
                              <div class="flex items-center">
                                <yb-icon
                                  :svg="import('@/svg/trash.svg?raw')"
                                  width="13"
                                  height="13"
                                />
                                <span class="ml-3">{{ I18nT('base.del') }}</span>
                              </div>
                            </template>
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="apiToken" label="ApiToken">
        <template #default="scope">
          <span
            class="overflow-hidden truncate hover:text-yellow-500"
            @click.stop="copy(scope.row.apiToken)"
            >{{ scope.row.apiToken }}</span
          >
        </template>
      </el-table-column>
      <el-table-column prop="tunnelName" label="Tunnel Name">
        <template #default="scope">
          <span
            class="overflow-hidden truncate hover:text-yellow-500"
            @click.stop="copy(scope.row.tunnelName)"
            >{{ scope.row.tunnelName }}</span
          >
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('php.quickStart')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-button
            link
            class="status group-off"
            :class="{ off: appStore?.phpGroupStart?.[scope.row.id] === false }"
            @click.stop="groupTrunOn(scope.row)"
          >
            <yb-icon
              style="width: 30px; height: 30px"
              :svg="import('@/svg/nogroupstart.svg?raw')"
            />
          </el-button>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.service')" :prop="null" width="100px">
        <template #default="scope">
          <template v-if="scope.row.running">
            <el-button :loading="true" link></el-button>
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
      <el-table-column align="center" :label="I18nT('host.action')" width="100px">
        <template #default="scope">
          <div class="w-full h-full flex items-center justify-center">
            <el-dropdown class="h-full">
              <template #default>
                <div class="h-full w-full flex items-center justify-center">
                  <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                </div>
              </template>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click.stop="action(scope.row, scope.$index, 'edit')">
                    <template #default>
                      <div class="flex items-center">
                        <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                        <span class="ml-3">{{ I18nT('base.edit') }}</span>
                      </div>
                    </template>
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="action(scope.row, scope.$index, 'info')">
                    <template #default>
                      <div class="flex items-center">
                        <yb-icon :svg="import('@/svg/shengcheng.svg?raw')" width="13" height="13" />
                        <span class="ml-3">{{ I18nT('base.info') }}</span>
                      </div>
                    </template>
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="action(scope.row, scope.$index, 'del')">
                    <template #default>
                      <div class="flex items-center">
                        <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                        <span class="ml-3">{{ I18nT('base.del') }}</span>
                      </div>
                    </template>
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
  import { I18nT } from '@lang/index'
  import { Plus } from '@element-plus/icons-vue'
  import { Setup } from './setup'
  import { AppStore } from '@/store/app'
  import { CloudflareTunnel } from '@/core/CloudflareTunnel/CloudflareTunnel'
  import { CloudflareTunnelDnsRecord } from '@/core/CloudflareTunnel/type'

  const appStore = AppStore()

  const {
    add,
    edit,
    del,
    info,
    list,
    openOutUrl,
    openLocalUrl,
    groupTrunOn,
    copy,
    editDNS,
    delDNS,
    addDNS
  } = Setup()

  const action = (item: CloudflareTunnel, index: number, flag: string) => {
    switch (flag) {
      case 'edit':
        edit(item)
        break
      case 'info':
        info(item)
        break
      case 'del':
        del(item, index)
        break
    }
  }

  const dnsAction = (
    item: CloudflareTunnel,
    dns: CloudflareTunnelDnsRecord,
    index: number,
    flag: string
  ) => {
    switch (flag) {
      case 'edit':
        editDNS(item, dns, index)
        break
      case 'del':
        delDNS(item, dns, index)
        break
    }
  }
</script>
<style lang="scss" scoped>
  .service-table {
    :deep(.el-table__expanded-cell) {
      padding-top: 0 !important;
    }
  }
</style>
