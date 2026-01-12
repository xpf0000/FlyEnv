<!-- BasicConfig.vue 基础配置 -->
<template>
  <div class="basic-config h-full overflow-hidden flex flex-col">
    <h3 class="text-lg font-medium mb-4 text-gray-700 flex-shrink-0">批量处理</h3>

    <el-form label-position="top" class="mb-4 flex-shrink-0" @submit.prevent>
      <el-form-item label="覆盖源文件">
        <el-switch v-model="ImageBatch.rewrite"></el-switch>
      </el-form-item>
      <el-form-item v-if="!ImageBatch.rewrite" label="保存位置">
        <el-input :model-value="ImageBatch.saveDir" readonly>
          <template #append>
            <el-button
              :icon="FolderOpened"
              @click.stop="ImageBatch.selectSaveDir('save')"
            ></el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item label="备份位置">
        <el-input :model-value="ImageBatch.backupDir" readonly>
          <template #append>
            <el-button
              :icon="FolderOpened"
              @click.stop="ImageBatch.selectSaveDir('backup')"
            ></el-button>
          </template>
        </el-input>
      </el-form-item>
    </el-form>

    <el-card class="app-base-el-card flex-1">
      <template #header>
        <div class="flex items-center justify-between">
          <span>图片文件</span>
          <div class="flex items-center">
            <el-button
              :icon="Plus"
              type="primary"
              link
              @click.stop="ImageBatch.selectDir()"
            ></el-button>
            <el-button :disabled="!choosed.length" :icon="Delete" type="danger" link></el-button>
          </div>
        </div>
      </template>
      <el-table row-key="path" class="h-full" :data="ImageBatch.images">
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column type="index"></el-table-column>
        <el-table-column label="路径">
          <template #default="scope">
            <BatchImageTablePathCell :content="scope.row.path" />
          </template>
        </el-table-column>
        <el-table-column label="处理前">
          <template #default="scope">
            <div v-if="scope.row.status === 'fetching'" class="flex items-center justify-center">
              <el-button link loading></el-button>
            </div>
            <div v-else-if="!scope.row?.hasError" class="flex flex-col gap-1">
              <span>格式: {{ scope.row.ext }}</span>
              <span>宽高: {{ scope.row.width }}x{{ scope.row.height }}</span>
              <span>大小: {{ scope.row.sizeFormatted }}</span>
            </div>
            <div v-else>
              <span class="truncate">{{ scope.row.errorMessage }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="处理后">
          <template #default="scope">
            <div v-if="scope.row?.result" class="flex flex-col gap-1">
              <span>格式: {{ scope.row?.result.ext }}</span>
              <span>宽高: {{ scope.row?.result.width }}x{{ scope.row?.result.height }}</span>
              <span>大小: {{ scope.row?.result.sizeFormatted }}</span>
            </div>
            <div
              v-else-if="scope.row.status === 'fetching'"
              class="flex items-center justify-center"
            >
              <el-button link loading></el-button>
            </div>
            <div v-else-if="scope.row.status === 'fetched' && scope.row?.result?.hasError">
              <span class="truncate">{{ scope.row?.result?.errorMessage }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ImageBatch } from './setup'
  import { Delete, FolderOpened, Plus } from '@element-plus/icons-vue'
  import BatchImageTablePathCell from '@/components/Tools/ImageCompress/BatchImageTablePathCell.vue'

  const choosed = ref([])
</script>
