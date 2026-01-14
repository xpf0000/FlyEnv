<!-- BasicConfig.vue 基础配置 -->
<template>
  <div class="basic-config h-full overflow-hidden flex flex-col">
    <h3 class="text-lg font-medium mb-4 flex-shrink-0">批量处理</h3>

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
      <el-form-item v-else label="备份位置">
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

    <el-card class="app-base-el-card flex-1 w-full">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span>图片文件</span>
            <template v-if="isLocked">
              <el-tooltip placement="top" :content="I18nT('fork.trialEnd')">
                <Lock class="w-[18px] h-[18px] text-yellow-500 select-none outline-none"></Lock>
              </el-tooltip>
            </template>
            <template v-else>
              <template v-if="ImageBatch.processing">
                <el-button :loading="true" link></el-button>
              </template>
              <template v-else>
                <el-button
                  link
                  type="success"
                  :disabled="!ImageBatch.images.length"
                  @click.stop="ImageBatch.doProcess()"
                >
                  <yb-icon class="w-[18px] h-[18px]" :svg="import('@/svg/play.svg?raw')" />
                </el-button>
              </template>
            </template>
          </div>
          <div class="flex items-center">
            <el-button
              :icon="Plus"
              type="primary"
              link
              @click.stop="ImageBatch.selectDir()"
            ></el-button>
            <el-button
              :disabled="!choosed.length"
              :icon="Delete"
              type="danger"
              link
              @click.stop="doDelete"
            ></el-button>
          </div>
        </div>
      </template>
      <el-table
        row-key="path"
        class="h-full w-full"
        :data="ImageBatch.images"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column type="index"></el-table-column>
        <el-table-column label="路径" width="auto" prop="path">
          <template #default="scope">
            <BatchImageTablePathCell :content="scope.row.path" />
          </template>
        </el-table-column>
        <el-table-column label="处理前" width="160px">
          <template #default="scope">
            <div v-if="scope.row.status === 'fetching'" class="flex items-center">
              <el-button link loading></el-button>
            </div>
            <div v-else-if="!scope.row?.hasError" class="flex flex-col items-start gap-1">
              <el-tag type="primary">{{ scope.row.ext }}</el-tag>
              <el-tag type="success">{{ scope.row.width }}x{{ scope.row.height }}</el-tag>
              <el-tag type="warning">{{ scope.row.sizeFormatted }}</el-tag>
            </div>
            <div v-else>
              <span class="truncate">{{ scope.row.errorMessage }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="处理后" width="160px">
          <template #default="scope">
            <div v-if="scope.row?.result" class="flex flex-col items-start gap-1">
              <el-tag type="primary">{{ scope.row?.result.ext }}</el-tag>
              <el-tag type="success"
                >{{ scope.row?.result.width }}x{{ scope.row?.result.height }}</el-tag
              >
              <el-tag type="warning">{{ scope.row?.result.sizeFormatted }}</el-tag>
            </div>
            <div v-else-if="scope.row.status === 'processing'" class="flex items-center">
              <el-button link loading></el-button>
            </div>
            <div v-else-if="scope.row.status === 'processed' && scope.row?.result?.hasError">
              <span class="truncate">{{ scope.row?.result?.errorMessage }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { ImageBatch } from './setup'
  import { Delete, FolderOpened, Lock, Plus } from '@element-plus/icons-vue'
  import BatchImageTablePathCell from '@/components/Tools/ImageCompress/BatchImageTablePathCell.vue'
  import { SetupStore } from '@/components/Setup/store'
  import { I18nT } from '@lang/index'

  const setupStore = SetupStore()
  const choosed = ref([])

  const isLocked = computed(() => {
    if (setupStore.isActive) {
      return false
    }
    if (ImageBatch.trialStartTime === 0) {
      return false
    }

    const currentTime = Math.round(new Date().getTime() / 1000)
    if (ImageBatch.trialStartTime + 3 * 24 * 60 * 60 < currentTime) {
      return true
    }

    return false
  })

  const handleSelectionChange = (val: any) => {
    console.log('handleSelectionChange: ', val)
    choosed.value = val
  }

  const doDelete = () => {
    if (!choosed.value.length) {
      return
    }
    ImageBatch.images = ImageBatch.images.filter((image) => {
      return !choosed.value.find((f: any) => f.path === image.path)
    })
  }
</script>
