<template>
  <el-table border :data="list">
    <el-table-column
      :label="I18nT('mysql.databaseName')"
      prop="database"
      width="160px"
    ></el-table-column>
    <el-table-column
      :label="I18nT('mysql.databaseUser')"
      prop="user"
      width="160px"
    ></el-table-column>
    <el-table-column :label="I18nT('mysql.databasePassword')" prop="password" width="160px">
      <template #default="scope">
        <template v-if="scope.row.password">
          <div class="flex items-center">
            <template v-if="scope.row.showPassword">
              <span class="mr-2">{{ scope.row.password }}</span>
              <el-button link> <Hide class="w-4 h-4" /></el-button>
            </template>
            <template v-else>
              <span class="mr-2">*********</span>
              <el-button link> <View class="w-4 h-4" /></el-button>
            </template>
            <el-button link> <CopyDocument class="w-4 h-4" /></el-button>
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

  const list = computed(() => {
    return MySQLManage.databaseRaw.map((d) => {
      console.log('d: ', d)
      const findSave = MySQLManage.databaseSaved.find(
        (s) => s.database === d.name && d.users.includes(s.user)
      )
      return {
        database: d.name,
        user: findSave?.user ?? d?.users?.[0] ?? 'root',
        password: findSave?.password ?? '',
        mark: findSave?.mark ?? '',
        showPassword: false
      }
    })
  })

  const onMarkChange = (row: any) => {
    console.log('onMarkChange', row)
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
