<template>
  <template v-if="OllamaAllModelsSetup.installing">
    <div class="w-full h-full overflow-hidden p-5">
      <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
    </div>
  </template>
  <template v-else>
    <el-table
      row-key="name"
      :tree-props="{ children: 'children', hasChildren: 'children' }"
      lazy
      :load="onLoad"
      height="100%"
      :data="tableData"
      :border="false"
      style="width: 100%"
    >
      <template #empty>
        <template v-if="fetching">
          {{ I18nT('base.gettingVersion') }}
        </template>
        <template v-else>
          {{ I18nT('util.noVerionsFoundInLib') }}
        </template>
      </template>
      <el-table-column prop="name">
        <template #header>
          <div class="w-p100 name-cell">
            <span style="display: inline-flex; align-items: center; padding: 2px 0">{{
              I18nT('base.Library')
            }}</span>
            <el-input
              v-model.trim="OllamaAllModelsSetup.search"
              :placeholder="I18nT('base.placeholderSearch')"
              clearable
            ></el-input>
          </div>
        </template>
        <template #default="scope">
          <el-tooltip :content="fetchCommand(scope.row)" :show-after="600" placement="top">
            <span
              class="hover:text-yellow-500 cursor-pointer truncate"
              style="padding: 2px 12px 2px 24px"
              @click.stop="copyCommand(scope.row)"
              >{{ scope.row.name }}</span
            >
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="size" :label="I18nT('ollama.size')" width="150"> </el-table-column>
      <el-table-column align="center" :label="I18nT('base.isInstalled')" width="120">
        <template #default="scope">
          <div class="cell-status">
            <yb-icon
              v-if="isInstalled(scope.row)"
              :svg="import('@/svg/ok.svg?raw')"
              class="installed"
            ></yb-icon>
          </div>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="I18nT('base.operation')" width="120">
        <template #default="scope">
          <template v-if="!scope.row.isRoot">
            <template v-if="isInstalled(scope.row)">
              <el-button
                :type="runningService ? 'primary' : 'info'"
                link
                :disabled="OllamaAllModelsSetup.installing"
                :icon="Delete"
                @click="handleBrewVersion(scope.row)"
              ></el-button>
            </template>
            <template v-else>
              <el-button
                :type="runningService ? 'primary' : 'info'"
                link
                :disabled="OllamaAllModelsSetup.installing"
                :icon="Download"
                @click="handleBrewVersion(scope.row)"
              ></el-button>
            </template>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </template>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { OllamaAllModelsSetup, Setup } from './setup'
  import type { TreeNode } from 'element-plus'
  import { OllamaLocalModelsSetup } from '@/components/Ollama/models/local/setup'
  import { Download, Delete } from '@element-plus/icons-vue'

  const {
    xtermDom,
    fetching,
    tableData,
    handleBrewVersion,
    fetchCommand,
    copyCommand,
    runningService
  } = Setup()

  const isInstalled = (row: any) => {
    return OllamaLocalModelsSetup.list.some((l) => l.name === row.name)
  }

  const onLoad = (row: any, treeNode: TreeNode, resolve: (data: any[]) => void) => {
    const child = OllamaAllModelsSetup.list[row.name]
    console.log('onLoad: ', row, child)
    resolve(child)
  }
</script>
<style lang="scss">
  .app-html-block {
    a {
      color: #4096ff;
    }
  }
</style>
