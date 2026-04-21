<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>{{ I18nT('hermes.skills') }}</span>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('hermes.openSkillsDir') }}</span>
            </template>
            <template #reference>
              <el-button
                class="custom-folder-add-btn"
                :icon="FolderOpened"
                link
                @click.stop="HermesSetup.openSkillsDir()"
              ></el-button>
            </template>
          </el-popover>
          <el-button class="button" link @click="HermesSetup.openSkillsDocs()">
            <yb-icon style="width: 20px; height: 20px" :svg="import('@/svg/http.svg?raw')"></yb-icon>
          </el-button>
          <el-radio-group v-model="HermesSetup.skillTab" size="small" class="ml-6">
            <el-radio-button class="flex-1" :label="I18nT('hermes.installed')" value="installed"></el-radio-button>
            <el-radio-button class="flex-1" :label="I18nT('hermes.allSkills')" value="all"></el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" link :disabled="HermesSetup.loading" @click="handleRefresh">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': HermesSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template v-if="HermesSetup.skillTab === 'installed'">
      <SkillsInstalled />
    </template>
    <template v-else>
      <SkillsAll />
    </template>

    <el-dialog v-model="HermesSetup.skillInspectVisible" :title="I18nT('hermes.preview')" width="70%" top="5vh">
      <pre class="whitespace-pre-wrap break-words text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded overflow-auto max-h-[70vh]">{{ HermesSetup.skillInspectContent }}</pre>
    </el-dialog>
  </el-card>
</template>

<script lang="ts" setup>
  import { onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { HermesSetup } from './setup'
  import { FolderOpened } from '@element-plus/icons-vue'
  import SkillsInstalled from './SkillsInstalled.vue'
  import SkillsAll from './SkillsAll.vue'

  const handleRefresh = () => {
    if (HermesSetup.skillTab === 'installed') {
      HermesSetup.refreshInstalledSkills()
    } else {
      HermesSetup.browseAllSkills()
    }
  }

  onMounted(() => {
    HermesSetup.fetchSkillConfig()
    HermesSetup.refreshInstalledSkills()
  })
</script>

<style lang="scss" scoped>
  .version-manager {
    :deep(.el-card__body) {
      padding: 0;
      height: calc(100% - 55px);
      overflow: hidden;
    }
  }
</style>
