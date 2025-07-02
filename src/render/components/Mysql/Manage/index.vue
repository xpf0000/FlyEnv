<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3 truncate">{{ item.version }} - {{ item.path }}</span>
        </div>
      </div>
      <div class="main-wapper p-3">
        <el-card class="h-full">
          <template #header>
            <div class="card-header">
              <div class="left">
                <template v-if="item.running">
                  <el-button :loading="true" link></el-button>
                </template>
                <template v-else>
                  <template v-if="item.run">
                    <el-button
                      link
                      class="status running"
                      :class="{ disabled: versionRunning }"
                      @click.stop="item.serviceDo('stop')"
                    >
                      <yb-icon :svg="import('@/svg/stop2.svg?raw')" />
                    </el-button>
                    <el-button
                      link
                      class="status refresh"
                      :class="{ disabled: versionRunning }"
                      @click.stop="item.serviceDo('restart')"
                    >
                      <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" />
                    </el-button>
                  </template>
                  <template v-else>
                    <el-button
                      link
                      class="status start current"
                      :class="{
                        disabled: versionRunning || !item.version
                      }"
                      @click.stop="item.serviceDo('start')"
                    >
                      <yb-icon :svg="import('@/svg/play.svg?raw')" />
                    </el-button>
                  </template>
                </template>
                <el-button>添加数据库</el-button>
                <el-button @click.stop="showRootPassword">{{
                  I18nT('mysql.rootPassword')
                }}</el-button>
                <el-button>phpMyAdmin</el-button>
                <el-button>数据库备份</el-button>
                <el-button>MySQL用户管理</el-button>
              </div>
            </div>
          </template>
          <template #default>
            <template v-if="!item.run">
              <el-empty :description="I18nT('mysql.mysqlNeedRunTips')"></el-empty>
            </template>
          </template>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { MySQLManage } from '@/components/Mysql/Manage/manage'
  import { computed, watch } from 'vue'
  import { BrewStore } from '@/store/brew'

  const props = defineProps<{
    item: ModuleInstalledItem
  }>()

  const brewStore = BrewStore()

  const versionRunning = computed(() => {
    return brewStore.module('mysql')?.installed?.some((f) => f.running)
  })

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const showRootPassword = () => {
    console.log('showRootPassword item: ', props.item)
    import('./rootPassword.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item: props.item
      }).then()
    })
  }

  if (props.item.run) {
    MySQLManage.fetchDatabase(props.item)
      .then(() => {})
      .catch()
  }

  watch(
    () => props.item.run,
    (v) => {
      if (v) {
        MySQLManage.fetchDatabase(props.item)
          .then(() => {})
          .catch()
      }
    }
  )

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
