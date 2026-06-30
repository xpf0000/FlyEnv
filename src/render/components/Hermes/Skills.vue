<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header gap-5">
        <div class="flex items-center flex-1 overflow-hidden">
          <span class="flex-shrink-0">{{ I18nT('hermes.skills') }}</span>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('hermes.openSkillsDir') }}</span>
            </template>
            <template #reference>
              <el-button class="ml-2 flex-shrink-0" link @click.stop="HermesSetup.openSkillsDir()">
                <FolderOpened class="w-[18px] h-[18px]" />
              </el-button>
            </template>
          </el-popover>
          <el-button class="button flex-shrink-0" link @click="HermesSetup.openSkillsDocs()">
            <yb-icon
              style="width: 20px; height: 20px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
          <el-scrollbar class="flex-1 ml-6 h-full overflow-hidden">
            <div class="h-full flex items-center py-1">
              <el-radio-group
                v-model="HermesSetup.skillTab"
                style="flex-wrap: nowrap"
                size="small"
                class="flex-nowrap"
              >
                <el-radio-button
                  class="flex-1"
                  :label="I18nT('common.state.installed')"
                  value="installed"
                ></el-radio-button>
                <el-radio-button class="flex-1" label="All" value="all"></el-radio-button>
                <el-radio-button class="flex-1" label="Official" value="official"></el-radio-button>
                <el-radio-button
                  class="flex-1"
                  label="Skills.sh"
                  value="skills-sh"
                ></el-radio-button>
                <el-radio-button
                  class="flex-1"
                  label="Well-known"
                  value="well-known"
                ></el-radio-button>
                <el-radio-button class="flex-1" label="GitHub" value="github"></el-radio-button>
                <el-radio-button class="flex-1" label="ClawHub" value="clawhub"></el-radio-button>
                <el-radio-button class="flex-1" label="LobeHub" value="lobehub"></el-radio-button>
              </el-radio-group>
            </div>
          </el-scrollbar>
        </div>
        <el-button
          class="button flex-shrink-0"
          link
          :disabled="HermesSetup.loading"
          @click="handleRefresh"
        >
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
  </el-card>
</template>

<script lang="ts" setup>
  import { onMounted, watch } from 'vue'
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

  watch(
    () => HermesSetup.skillTab,
    (v) => {
      if (v !== 'installed') {
        const state = HermesSetup.onlineSkill[v]
        if (state.skills.length === 0) {
          HermesSetup.browseAllSkills()
        }
      }
    }
  )

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
