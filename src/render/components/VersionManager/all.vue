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
          <el-radio-group v-model="libSrc" size="small" class="ml-6">
            <el-radio-button
              class="flex-1"
              :label="I18nT('versionmanager.Local')"
              value="local"
            ></el-radio-button>
            <template v-if="hasStatic">
              <el-radio-button value="static">Static</el-radio-button>
            </template>
            <template v-if="showBrewLib !== false">
              <el-radio-button value="brew">Homebrew</el-radio-button>
            </template>
            <template v-if="showPortLib !== false">
              <el-radio-button value="port">MacPorts</el-radio-button>
            </template>
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
    <template v-if="libSrc === 'brew'">
      <BrewVM :type-flag="typeFlag" />
    </template>
    <template v-else-if="libSrc === 'port'">
      <PortVM :type-flag="typeFlag" />
    </template>
    <template v-else-if="libSrc === 'static'">
      <StaticVM :type-flag="typeFlag" />
    </template>
    <template v-else-if="libSrc === 'local'">
      <LocalVM :type-flag="typeFlag" />
    </template>

    <template v-if="showFooter" #footer>
      <template v-if="taskEnd">
        <el-button type="primary" @click.stop="taskConfirm">{{ I18nT('base.confirm') }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import { ServiceActionStore } from '../ServiceManager/EXT/store'
  import { SetupAll } from './setupAll'
  import type { AllAppModule } from '@/core/type'
  import { FolderAdd } from '@element-plus/icons-vue'
  import PortVM from '@/components/VersionManager/port/index.vue'
  import BrewVM from '@/components/VersionManager/brew/index.vue'
  import StaticVM from '@/components/VersionManager/static/index.vue'
  import LocalVM from '@/components/VersionManager/local/index.vue'

  const props = defineProps<{
    typeFlag: AllAppModule
    title: string
    url: string
    hasStatic: boolean
    showBrewLib: boolean
    showPortLib: boolean
  }>()

  const {
    libSrc,
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel,
    loading,
    reFetch,
    openURL,
    showCustomDir
  } = SetupAll(props.typeFlag)
  ServiceActionStore.fetchPath()
</script>
