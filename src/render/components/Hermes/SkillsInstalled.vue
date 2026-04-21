<template>
  <el-table :data="filteredSkills" style="width: 100%" height="100%">
    <el-table-column prop="name" min-width="160" show-overflow-tooltip>
      <template #header>
        <div class="w-full flex items-center gap-2 pl-[24px]">
          <span>{{ I18nT('hermes.name') }}</span>
          <el-input
            v-model.trim="search"
            :placeholder="I18nT('base.placeholderSearch')"
            clearable
            size="small"
            style="width: 140px"
          ></el-input>
        </div>
      </template>
      <template #default="scope">
        <span
          class="truncate pl-[24px] cursor-pointer hover:text-yellow-500"
          @click="openSkillFile(scope.row)"
          >{{ scope.row.name }}</span
        >
      </template>
    </el-table-column>
    <el-table-column
      prop="category"
      :label="I18nT('hermes.categoryName')"
      min-width="160"
      show-overflow-tooltip
    >
      <template #header>
        <span class="truncate">{{ I18nT('hermes.categoryName') }}</span>
      </template>
      <template #default="scope">
        <span
          class="truncate cursor-pointer hover:text-yellow-500"
          @click="openCategoryDir(scope.row.category)"
          >{{ scope.row.category }}</span
        >
      </template>
    </el-table-column>
    <el-table-column prop="source" :label="I18nT('hermes.source')" width="100">
      <template #default="{ row }">
        <el-tag v-if="row.isBuiltin" size="small" type="info">{{ I18nT('hermes.builtin') }}</el-tag>
        <el-tag v-else-if="row.isHub" size="small" type="success">{{ I18nT('hermes.hub') }}</el-tag>
        <el-tag v-else size="small" type="warning">{{ I18nT('hermes.local') }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column
      prop="trust"
      :label="I18nT('hermes.trust')"
      width="120"
      show-overflow-tooltip
    />
    <el-table-column :label="I18nT('hermes.status')" width="90" align="center">
      <template #default="{ row }">
        <el-tag v-if="row.enabled" size="small" type="success">{{
          I18nT('hermes.enabled')
        }}</el-tag>
        <el-tag v-else size="small" type="danger">{{ I18nT('hermes.disabled') }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column :label="I18nT('base.action')" width="100" align="center" fixed="right">
      <template #default="{ row }">
        <el-popover
          effect="dark"
          popper-class="host-list-poper"
          placement="left-start"
          width="auto"
          :show-arrow="false"
        >
          <ul v-poper-fix class="host-list-menu">
            <li @click.stop="handleView(row)">
              <yb-icon :svg="import('@/svg/eye.svg?raw')" width="13" height="13" />
              <span class="ml-3">{{ I18nT('base.view') }}</span>
            </li>
            <li v-if="!row.isBuiltin" @click.stop="HermesSetup.updateSkill(row.name)">
              <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" width="13" height="13" />
              <span class="ml-3">{{ I18nT('hermes.updateSkill') }}</span>
            </li>
            <li v-if="!row.isBuiltin" @click.stop="handleUninstall(row.name)">
              <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
              <span class="ml-3">{{ I18nT('base.uninstall') }}</span>
            </li>
            <li @click.stop="handleReset(row.name)">
              <yb-icon :svg="import('@/svg/load-default.svg?raw')" width="13" height="13" />
              <span class="ml-3">{{ I18nT('hermes.resetSkill') }}</span>
            </li>
            <li @click.stop="HermesSetup.toggleSkillEnabled(row.name, !row.enabled)">
              <yb-icon :svg="import('@/svg/switch.svg?raw')" width="13" height="13" />
              <span class="ml-3">{{
                row.enabled ? I18nT('hermes.disable') : I18nT('hermes.enable')
              }}</span>
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
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { HermesSetup } from './setup'
  import { ElMessageBox } from 'element-plus'
  import { shell, app } from '@/util/NodeFn'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import type { InstalledSkillItem } from './setup'

  let SkillViewVM: any
  import('./SkillView.vue').then((res) => {
    SkillViewVM = res.default
  })

  const search = ref('')

  const filteredSkills = computed(() => {
    let list = HermesSetup.installedSkills
    if (search.value) {
      const q = search.value.toLowerCase()
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
      )
    }
    return list
  })

  const openSkillFile = async (row: InstalledSkillItem) => {
    const home = await app.getPath('home')
    const path = `${home}/.hermes/skills/${row.category}/${row.name}/SKILL.md`
    shell.showItemInFolder(path)
  }

  const openCategoryDir = async (category: string) => {
    const home = await app.getPath('home')
    const path = `${home}/.hermes/skills/${category}`
    shell.openPath(path)
  }

  const handleView = (row: InstalledSkillItem) => {
    AsyncComponentShow(SkillViewVM, {
      category: row.category,
      name: row.name
    }).then()
  }

  const handleUninstall = (name: string) => {
    ElMessageBox.confirm(I18nT('hermes.uninstallConfirm', { name }), I18nT('base.confirm'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        HermesSetup.uninstallSkill(name)
      })
      .catch(() => {})
  }

  const handleReset = (name: string) => {
    ElMessageBox.confirm(I18nT('hermes.resetConfirm', { name }), I18nT('base.confirm'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        HermesSetup.resetSkill(name, true)
      })
      .catch(() => {})
  }
</script>
