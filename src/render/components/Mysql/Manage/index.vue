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
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="left">
                <el-button>添加数据库</el-button>
                <el-button @click.sto="showRootPassword">{{
                  I18nT('mysql.rootPassword')
                }}</el-button>
                <el-button>phpMyAdmin</el-button>
                <el-button>数据库备份</el-button>
                <el-button>MySQL用户管理</el-button>
              </div>
            </div>
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

  const props = defineProps<{
    item: ModuleInstalledItem
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const showRootPassword = () => {
    console.log('showRootPassword item: ', props.item)
    import('./rootPassword.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item: props.item
      }).then()
    })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
