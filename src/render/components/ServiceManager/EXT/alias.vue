<template>
  <el-dialog
    v-model="show"
    :title="title"
    width="600px"
    :destroy-on-close="true"
    class="host-link-dialog"
    @closed="closedFn"
  >
    <div class="">
      <el-button
        class="mb-2"
        type="primary"
        size="small"
        :icon="Plus"
        @click.stop="doEdit(undefined)"
      ></el-button>
      <el-table :data="alias" style="width: 100%" :border="true" :show-overflow-tooltip="true">
        <el-table-column width="120px" align="left" :label="I18nT('service.alias')">
          <template #default="scope">
            <el-button link @click.stop="copy(scope.row.name)">{{ scope.row.name }}</el-button>
          </template>
        </el-table-column>
        <template v-if="item.typeFlag === 'composer'">
          <el-table-column width="120px" align="left" prop="name" :label="I18nT('host.phpVersion')">
            <template #default="scope">
              <template v-if="scope.row?.php?.bin">
                <el-button link @click.stop="open(scope.row.php.bin)"
                  >php-{{ scope.row.php.version }}</el-button
                >
              </template>
            </template>
          </el-table-column>
        </template>
        <el-table-column align="left" :label="I18nT('base.path')">
          <template #default="scope">
            <el-button
              class="overflow-hidden truncate max-w-full justify-start"
              link
              type="primary"
              @click.stop="open(scope.row.path)"
              >{{ scope.row.path }}</el-button
            >
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('base.action')" :prop="null" width="100px" align="center">
          <template #default="scope">
            <el-button link type="primary" :icon="Edit" @click.stop="doEdit(scope.row)"></el-button>
            <el-popconfirm
              :title="I18nT('base.areYouSure')"
              @confirm="ServiceActionStore.setAlias(item, undefined, scope.row)"
            >
              <template #reference>
                <el-button link type="danger" :icon="Delete"></el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import { MessageSuccess } from '@/util/Element'
  import { AppStore } from '@/store/app'
  import { Edit, Delete, Plus } from '@element-plus/icons-vue'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
  import type { SoftInstalled } from '@/store/brew'
  import { join, resolve } from '@/util/path-browserify'
  import { shell, clipboard } from '@/util/NodeFn'

  const props = defineProps<{
    item: SoftInstalled
  }>()
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const store = AppStore()

  const title = computed(() => {
    return `${props.item.typeFlag}-${props.item.version} ${I18nT('service.alias')}`
  })

  const alias = computed(() => {
    const aliasDir = resolve(window.Server.BaseDir!, '../alias')
    console.log('aliasDir', aliasDir)
    const list = store.config.setup?.alias?.[props.item.bin] ?? []
    return list.map((item) => {
      return {
        ...item,
        path: join(aliasDir, `${item.name}`)
      }
    })
  })

  const copy = (url: string) => {
    clipboard.writeText(url)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const open = (item: string) => {
    shell.showItemInFolder(item)
  }

  let EditVM: any
  import('./aliasEdit.vue').then((res) => {
    EditVM = res.default
  })

  const doEdit = (item: any) => {
    AsyncComponentShow(EditVM, {
      service: props.item,
      item,
      typeFlag: props.item.typeFlag
    }).then()
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
