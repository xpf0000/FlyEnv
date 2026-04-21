<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center gap-2 mb-3">
      <el-input v-model="skillSearchInput" :placeholder="I18nT('hermes.searchSkill')" clearable style="width: 300px" @keyup.enter="handleSearch" />
      <el-button type="primary" @click="handleSearch">{{ I18nT('hermes.search') }}</el-button>
      <el-button @click="handleClearSearch">{{ I18nT('hermes.clear') }}</el-button>
    </div>
    <el-table :data="HermesSetup.allSkills" style="width: 100%; flex: 1" size="small">
      <el-table-column type="index" width="50" />
      <el-table-column prop="name" :label="I18nT('hermes.name')" min-width="140" show-overflow-tooltip />
      <el-table-column prop="description" :label="I18nT('hermes.description')" min-width="240" show-overflow-tooltip />
      <el-table-column prop="source" :label="I18nT('hermes.source')" width="120" show-overflow-tooltip />
      <el-table-column prop="trust" :label="I18nT('hermes.trust')" width="120" show-overflow-tooltip />
      <el-table-column :label="I18nT('base.action')" width="180" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" type="primary" @click="HermesSetup.inspectSkill(row.name)">
            {{ I18nT('hermes.preview') }}
          </el-button>
          <el-button link size="small" type="success" @click="HermesSetup.installSkill(row.name)">
            {{ I18nT('base.install') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="flex justify-end mt-3">
      <el-pagination
        v-model:current-page="HermesSetup.skillPage"
        v-model:page-size="HermesSetup.skillPageSize"
        :total="HermesSetup.skillTotal"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @size-change="handlePageChange"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { HermesSetup } from './setup'

  const skillSearchInput = ref('')

  const handleSearch = () => {
    HermesSetup.skillPage = 1
    if (skillSearchInput.value) {
      HermesSetup.searchAllSkills(skillSearchInput.value)
    } else {
      HermesSetup.browseAllSkills()
    }
  }

  const handleClearSearch = () => {
    skillSearchInput.value = ''
    HermesSetup.skillPage = 1
    HermesSetup.browseAllSkills()
  }

  const handlePageChange = () => {
    if (skillSearchInput.value) {
      HermesSetup.searchAllSkills(skillSearchInput.value)
    } else {
      HermesSetup.browseAllSkills()
    }
  }

  watch(
    () => HermesSetup.skillTab,
    (val) => {
      if (val === 'all') {
        if (skillSearchInput.value) {
          handleSearch()
        } else {
          HermesSetup.browseAllSkills()
        }
      }
    }
  )
</script>
