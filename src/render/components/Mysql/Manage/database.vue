<template>
  <el-table border :data="list">
    <el-table-column
      :label="I18nT('mysql.databaseName')"
      prop="database"
      width="200px"
    ></el-table-column>
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
    <el-table-column :label="I18nT('host.action')" width="100px" align="center"></el-table-column>
  </el-table>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { MySQLManage } from '@/components/Mysql/Manage/manage'
  import { I18nT } from '@lang/index'
  import { View, Hide, CopyDocument } from '@element-plus/icons-vue'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { clipboard } from '@/util/NodeFn'
  import { MessageSuccess } from '@/util/Element'

  const props = defineProps<{
    item: ModuleInstalledItem
  }>()

  const list = computed(() => {
    return MySQLManage.databaseRaw.map((d) => {
      console.log('d: ', d)
      const saved = MySQLManage.databaseSaved?.[props.item.bin] ?? []
      const findSave = saved.find((s) => s.database === d.name && d.users.includes(s.user))
      const user = findSave?.user ?? d?.users?.[0] ?? 'root'
      const password = findSave?.password ?? (user === 'root' ? props.item.rootPassword : '')
      return {
        database: d.name,
        user,
        password,
        mark: findSave?.mark ?? '',
        showPassword: false
      }
    })
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
    }
    MySQLManage.save()
  }
</script>
<style lang="scss">
  .mysql-database-mark-cell {
    > .cell {
      width: 100%;
      height: 33px;
    }
  }
</style>
