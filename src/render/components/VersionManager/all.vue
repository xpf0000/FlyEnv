<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ title }} </span>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('base.customVersionDirTips') }}</span>
            </template>
            <template #reference>
              <el-button
                class="custom-folder-add-btn"
                :icon="FolderAdd"
                link
                @click.stop="showCustomDir"
              ></el-button>
            </template>
          </el-popover>
          <el-button class="button" link @click="openURL(url)">
            <yb-icon
              style="width: 20px; height: 20px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
          <el-radio-group v-model="tableTab" size="small" class="ml-6">
            <el-radio-button
              class="flex-1"
              :label="I18nT('versionmanager.Local')"
              value="local"
            ></el-radio-button>
            <el-radio-button
              class="flex-1"
              :label="I18nT('versionmanager.Library')"
              value="lib"
            ></el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" link :disabled="loading" @click="reFetch">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template v-if="tableTab === 'local'">
      <LocalVM :type-flag="typeFlag" />
    </template>
    <template v-else-if="tableTab === 'lib'">
      <StaticVM :type-flag="typeFlag" />
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { ServiceActionStore } from '../ServiceManager/EXT/store'
  import { SetupAll } from '@/components/VersionManager/setupAll'
  import type { AllAppModule } from '@/core/type'
  import { FolderAdd } from '@element-plus/icons-vue'
  import StaticVM from '@/components/VersionManager/static/index.vue'
  import LocalVM from '@/components/VersionManager/local/index.vue'

  const props = defineProps<{
    typeFlag: AllAppModule
    title: string
    url: string
  }>()

  const { openURL, showCustomDir, tableTab, loading, reFetch } = SetupAll(props.typeFlag)
  ServiceActionStore.fetchPath()
</script>
