<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header gap-4">
        <div class="flex items-center gap-2">
          <span>{{ I18nT('antigravity.skills') }}</span>
          <el-tooltip :content="I18nT('antigravity.openSkillsDir')" placement="top">
            <el-button link @click="AntigravitySetup.openSkillsDir()">
              <FolderOpened class="w-[18px] h-[18px]" />
            </el-button>
          </el-tooltip>
        </div>
        <el-button
          link
          :disabled="AntigravitySetup.skillsLoading"
          @click="AntigravitySetup.refreshSkills()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': AntigravitySetup.skillsLoading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <div
        v-loading="AntigravitySetup.skillsLoading"
        class="p-5 h-full overflow-hidden flex flex-col"
      >
        <el-scrollbar v-if="AntigravitySetup.skills.length > 0">
          <div v-for="item in AntigravitySetup.skills" :key="item.path" class="skill-row">
            <div class="skill-info">
              <div class="skill-title">
                <span class="name">{{ item.name }}</span>
                <el-tag v-if="item.builtin" size="small" type="info">
                  {{ I18nT('antigravity.builtin') }}
                </el-tag>
              </div>
              <div class="skill-desc">
                <el-tooltip
                  :content="item.description || item.path"
                  placement="top"
                  :show-after="300"
                >
                  <span>{{ item.description || item.path }}</span>
                </el-tooltip>
              </div>
            </div>
            <div class="skill-actions">
              <el-tooltip
                :content="I18nT('antigravity.openSkillDir')"
                placement="top"
                :show-after="300"
              >
                <el-button link @click="AntigravitySetup.openSkillDir(item)">
                  <yb-icon :svg="import('@/svg/folder.svg?raw')" width="18" height="18" />
                </el-button>
              </el-tooltip>
              <el-tooltip
                :content="I18nT('antigravity.revealSkillFile')"
                placement="top"
                :show-after="300"
              >
                <el-button link @click="AntigravitySetup.revealSkillFile(item)">
                  <yb-icon :svg="import('@/svg/fileinfo.svg?raw')" width="18" height="18" />
                </el-button>
              </el-tooltip>
              <el-tooltip :content="I18nT('base.info')" placement="top" :show-after="300">
                <el-button link @click="AntigravitySetup.viewSkill(item)">
                  <yb-icon :svg="import('@/svg/eye.svg?raw')" width="18" height="18" />
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </el-scrollbar>
        <el-empty
          v-else-if="!AntigravitySetup.skillsLoading"
          :description="I18nT('antigravity.noSkills')"
        />
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { onMounted } from 'vue'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { AntigravitySetup } from './setup'

  onMounted(() => {
    AntigravitySetup.refreshSkills()
  })
</script>
<style lang="scss" scoped>
  .skill-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    gap: 16px;

    .skill-info {
      flex: 1;
      overflow: hidden;

      .skill-title {
        display: flex;
        align-items: center;
        gap: 8px;

        .name {
          font-weight: 500;
        }
      }

      .skill-desc {
        margin-top: 4px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .skill-actions {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }
</style>
