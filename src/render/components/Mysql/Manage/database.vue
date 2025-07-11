<template>
  <el-table
    class="service-table"
    show-overflow-tooltip
    :data="list"
    @selection-change="handleSelectionChange"
  >
    <el-table-column type="selection" width="55" />
    <el-table-column :label="I18nT('mysql.databaseName')" prop="database" width="200px">
      <template #default="scope">
        <span
          class="truncate hover:text-yellow-500 cursor-pointer"
          @click.stop="copyPass(scope.row.database)"
          >{{ scope.row.database }}</span
        >
      </template>
    </el-table-column>
    <el-table-column :label="I18nT('mysql.databaseUser')" prop="user" width="200px">
      <template #default="scope">
        <span
          class="truncate hover:text-yellow-500 cursor-pointer"
          @click.stop="copyPass(scope.row.user)"
          >{{ scope.row.user }}</span
        >
      </template>
    </el-table-column>
    <el-table-column :label="I18nT('mysql.databasePassword')" prop="password" width="240px">
      <template #default="scope">
        <template v-if="scope.row.password">
          <div class="flex items-center">
            <template v-if="scope.row.showPassword">
              <span
                class="mr-3 truncate hover:text-yellow-500 cursor-pointer"
                @click.stop="copyPass(scope.row.password)"
                >{{ scope.row.password }}</span
              >
              <el-button link @click.stop="scope.row.showPassword = !scope.row?.showPassword">
                <Hide class="w-4 h-4"
              /></el-button>
            </template>
            <template v-else>
              <span class="mr-3">*********</span>
              <el-button link @click.stop="scope.row.showPassword = !scope.row?.showPassword">
                <View class="w-4 h-4"
              /></el-button>
            </template>
            <el-button link style="margin-left: 5px" @click.stop="copyPass(scope.row.password)">
              <CopyDocument class="p-[1px] w-4 h-4"
            /></el-button>
          </div>
        </template>
      </template>
    </el-table-column>
    <el-table-column
      class-name="mysql-database-mark-cell"
      :label="I18nT('host.comment')"
      prop="mark"
    >
      <template #default="scope">
        <div class="w-full h-full flex items-center group">
          <span class="group-hover:hidden">{{ scope.row.mark }}</span>
          <el-input
            v-model="scope.row.mark"
            class="hidden group-hover:flex"
            @change="onMarkChange(scope.row)"
          ></el-input>
        </div>
      </template>
    </el-table-column>
    <el-table-column :label="I18nT('host.action')" width="100px" align="center">
      <template #default="scope">
        <el-dropdown>
          <el-button link>
            <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click.stop="showSetPassword('update', scope.row)">
                <el-tooltip
                  placement="left"
                  :show-after="600"
                  :content="
                    I18nT('mysql.savePasswordTips', {
                      app: item.typeFlag === 'mysql' ? 'MySQL' : 'MariaDB'
                    })
                  "
                >
                  <div class="flex items-center w-full h-full">
                    {{ I18nT('mysql.savePassword') }}
                  </div>
                </el-tooltip>
              </el-dropdown-item>
              <el-dropdown-item @click.stop="showSetPassword('reset', scope.row)">
                <el-tooltip
                  placement="left"
                  :show-after="600"
                  :content="I18nT('mysql.resetPasswordTips')"
                >
                  <div class="flex items-center w-full h-full">
                    {{ I18nT('mysql.resetPassword') }}
                  </div>
                </el-tooltip>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </el-table-column>
  </el-table>
</template>
<script lang="ts" setup>
  import { computed, reactive, ref } from 'vue'
  import { MySQLManage } from '@/components/Mysql/Manage/manage'
  import { I18nT } from '@lang/index'
  import { View, Hide, CopyDocument } from '@element-plus/icons-vue'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { clipboard } from '@/util/NodeFn'
  import { MessageSuccess } from '@/util/Element'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const props = defineProps<{
    item: ModuleInstalledItem
  }>()

  const list = computed(() => {
    return MySQLManage.databaseRaw.map((d) => {
      console.log('d: ', d)
      const saved = MySQLManage.databaseSaved?.[props.item.bin] ?? []
      const findSave = saved.find((s) => s.database === d.name && d.users.includes(s.user))
      const user = findSave?.user ?? d?.users?.[0] ?? 'root'
      const password =
        MySQLManage.userPassword?.[props.item.bin]?.[user] ?? (user === 'root' ? 'root' : '')
      console.log('user: ', user, password)
      return {
        database: d.name,
        user,
        password,
        mark: findSave?.mark ?? '',
        showPassword: false
      }
    })
  })

  type SelectItem = {
    database: string
  }
  const multipleSelection = ref<SelectItem[]>([])
  const handleSelectionChange = (val: SelectItem[]) => {
    multipleSelection.value = val
  }

  const selectDatabase = computed(() => {
    return multipleSelection.value.map((d) => d.database)
  })

  const copyPass = (str: string): void => {
    clipboard.writeText(str)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const onMarkChange = (row: any) => {
    console.log('onMarkChange', row)
    const find = MySQLManage.databaseSaved?.[props.item.bin]?.find(
      (f) => f.database === row.database
    )
    if (find) {
      find.mark = row.mark
    } else {
      if (!MySQLManage.databaseSaved?.[props.item.bin]) {
        MySQLManage.databaseSaved[props.item.bin] = reactive([])
      }
      MySQLManage.databaseSaved[props.item.bin].unshift(
        reactive({
          database: row.database,
          user: row.user,
          mark: row.mark
        })
      )
    }
    MySQLManage.save()
  }

  const showSetPassword = (flag: 'update' | 'reset', item: any) => {
    import('./setPassword.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item: props.item,
        user: item.user,
        showUpdateBtn: flag === 'update',
        showResetBtn: flag === 'reset'
      }).then()
    })
  }

  defineExpose({
    selectDatabase
  })
</script>
<style lang="scss">
  .mysql-database-mark-cell {
    > .cell {
      width: 100%;
      height: 33px;
    }
  }
</style>
