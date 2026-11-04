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
    <el-table-column :label="I18nT('common.label.username')" prop="user" width="200px">
      <template #default="scope">
        <span
          class="truncate hover:text-yellow-500 cursor-pointer"
          :title="`${scope.row.user}@${scope.row.host}`"
          @click.stop="copyPass(scope.row.user)"
          >{{ scope.row.user }}</span
        >
      </template>
    </el-table-column>
    <el-table-column :label="I18nT('common.label.password')" prop="password" width="240px">
      <template #default="scope">
        <template v-if="scope.row.password">
          <div class="flex items-center">
            <template v-if="shown[scope.row.key]">
              <span
                class="mr-3 truncate hover:text-yellow-500 cursor-pointer"
                @click.stop="copyPass(scope.row.password)"
                >{{ scope.row.password }}</span
              >
              <el-button link @click.stop="shown[scope.row.key] = !shown[scope.row.key]">
                <Hide class="w-4 h-4"
              /></el-button>
            </template>
            <template v-else>
              <span class="mr-3">*********</span>
              <el-button link @click.stop="shown[scope.row.key] = !shown[scope.row.key]">
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
      :label="I18nT('common.label.comment')"
      prop="mark"
    >
      <template #default="scope">
        <div class="w-full h-full flex items-center group">
          <span class="group-hover:hidden">{{
            manager.preferences[id]?.marks?.[scope.row.database] ?? ''
          }}</span>
          <el-input
            v-model="scope.row.mark"
            :disabled="management.busy(id)"
            class="hidden group-hover:flex"
            @change="management.saveMark(id, scope.row.database, $event)"
          ></el-input>
        </div>
      </template>
    </el-table-column>
    <el-table-column :label="I18nT('common.label.action')" width="100px" align="center">
      <template #default="scope">
        <el-dropdown>
          <el-button link>
            <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                :disabled="management.busy(id)"
                @click.stop="showSetPassword('update', scope.row)"
              >
                <el-tooltip
                  placement="left"
                  :show-after="600"
                  :content="
                    I18nT('mysql.savePasswordTips', {
                      app: 'MySQL'
                    })
                  "
                >
                  <div class="flex items-center w-full h-full">
                    {{ I18nT('mysql.savePassword') }}
                  </div>
                </el-tooltip>
              </el-dropdown-item>
              <el-dropdown-item
                :disabled="management.readOnly(id) || management.busy(id)"
                @click.stop="showSetPassword('reset', scope.row)"
              >
                <el-tooltip
                  placement="left"
                  :show-after="600"
                  :content="I18nT('mysql.resetPasswordTips')"
                >
                  <div class="flex items-center w-full h-full">
                    {{ I18nT('common.action.resetPassword') }}
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
  import { MysqlManagement as management } from '../manage'
  import { MysqlClusterManager as manager } from '../manager'
  import { I18nT } from '@lang/index'
  import { View, Hide, CopyDocument } from '@element-plus/icons-vue'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const props = defineProps<{ id: string }>()
  const shown = reactive<Record<string, boolean>>({})
  const list = computed(() => {
    const listing = management.lists[props.id]
    return (listing?.databases ?? []).flatMap((database) => {
      const users = database.users.length ? database.users : ['root']
      return users.flatMap((user) => {
        const accounts = listing.users.filter((account) => account.User === user)
        return (accounts.length ? accounts : [{ User: user, Host: 'localhost' }]).map(
          (account) => ({
            key: `${database.name}:${account.User}@${account.Host}`,
            database: database.name,
            mark: manager.preferences[props.id]?.marks?.[database.name] ?? '',
            user: account.User,
            host: account.Host,
            password:
              manager.preferences[props.id]?.passwords?.[`${account.User}@${account.Host}`] ??
              (account.User === 'root' && account.Host === 'localhost'
                ? (manager.credentials[props.id]?.password ?? '')
                : '')
          })
        )
      })
    })
  })
  const multipleSelection = ref<{ database: string }[]>([])
  const handleSelectionChange = (val: { database: string }[]) => {
    multipleSelection.value = val
  }
  const selectDatabase = computed(() => [
    ...new Set(multipleSelection.value.map((d) => d.database))
  ])
  const copyPass = (value: string) => management.copy(value)
  const showSetPassword = (flag: 'update' | 'reset', row: { user: string; host: string }) => {
    import('./setPassword.vue').then((res) => {
      void AsyncComponentShow(res.default, {
        id: props.id,
        user: row.user,
        host: row.host,
        showUpdateBtn: flag === 'update',
        showResetBtn: flag === 'reset'
      })
    })
  }
  defineExpose({ selectDatabase })
</script>
<style lang="scss">
  .mysql-database-mark-cell {
    > .cell {
      width: 100%;
      height: 33px;
    }
  }
</style>
