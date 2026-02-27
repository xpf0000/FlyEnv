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
    <el-table class="service-table" :data="list">
      <el-table-column prop="out-url" :label="I18nT('host.OnlineDomain')">
        <template #header>
          <div class="pl-[24px] pr-[12px] flex items-center">
            <span>{{ I18nT('host.OnlineDomain') }}</span>
          </div>
        </template>
        <template #default="scope">
          <div class="pl-[24px] pr-[12px] flex items-center">
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
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="local-url" :label="I18nT('host.LocalDoman')">
        <template #default="scope">
          <template v-if="scope.row.run">
            <el-button type="success" link @click.stop="openLocalUrl(scope.row)"
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
      <el-table-column :label="I18nT('php.quickStart')" :prop="null" width="140px" align="center">
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
      <el-table-column align="center" :label="I18nT('host.action')" width="100px">
        <template #default="scope">
          <el-popover
            effect="dark"
            popper-class="host-list-poper"
            placement="left-start"
            width="auto"
            :show-arrow="false"
          >
            <ul v-poper-fix class="host-list-menu">
              <li @click.stop="action(scope.row, scope.$index, 'edit')">
                <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                <span class="ml-3">{{ I18nT('base.edit') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'info')">
                <yb-icon :svg="import('@/svg/shengcheng.svg?raw')" width="13" height="13" />
                <span class="ml-3">{{ I18nT('host.park') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'del')">
                <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                <span class="ml-3">{{ I18nT('base.del') }}</span>
              </li>
            </ul>

            <template #reference>
              <div class="right">
                <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
              </div>
            </template>
          </el-popover>
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

  const appStore = AppStore()

  const { add, edit, del, info, list, openOutUrl, openLocalUrl, groupTrunOn } = Setup()

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
</script>
