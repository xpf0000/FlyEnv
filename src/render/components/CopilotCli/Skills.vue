<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header gap-4">
        <div class="flex items-center gap-2">
          <span>{{ I18nT('common.category.skills') }}</span>
          <el-tooltip :content="I18nT('common.skills.openSkillsDir')" placement="top">
            <el-button link @click="CopilotCliSetup.openSkillsDir()">
              <FolderOpened class="w-[18px] h-[18px]" />
            </el-button>
          </el-tooltip>
        </div>
        <el-button
          link
          :disabled="CopilotCliSetup.skillsLoading"
          @click="CopilotCliSetup.refreshSkills()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': CopilotCliSetup.skillsLoading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <div
        v-loading="CopilotCliSetup.skillsLoading"
        class="p-5 h-full overflow-hidden flex flex-col"
      >
        <el-scrollbar v-if="CopilotCliSetup.skills.length > 0">
          <div
            v-for="item in CopilotCliSetup.skills"
            :key="item.path || item.name"
            class="skill-row"
          >
            <div class="skill-info">
              <div class="skill-title">
                <span class="name">{{ item.name }}</span>
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
              <el-popover
                effect="dark"
                popper-class="host-list-poper"
                placement="left-start"
                width="auto"
                :show-arrow="false"
              >
                <ul v-poper-fix class="host-list-menu">
                  <li v-if="item.path" @click.stop="CopilotCliSetup.openSkillDir(item)">
                    <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                    <span class="ml-3">{{ I18nT('common.skills.openSkillDir') }}</span>
                  </li>
                  <li v-if="item.path" @click.stop="CopilotCliSetup.revealSkillFile(item)">
                    <yb-icon :svg="import('@/svg/fileinfo.svg?raw')" width="13" height="13" />
                    <span class="ml-3">{{ I18nT('common.skills.revealSkillFile') }}</span>
                  </li>
                  <li @click.stop="CopilotCliSetup.viewSkill(item)">
                    <yb-icon :svg="import('@/svg/eye.svg?raw')" width="13" height="13" />
                    <span class="ml-3">{{ I18nT('common.action.preview') }}</span>
                  </li>
                </ul>

                <template #reference>
                  <div class="flex justify-center">
                    <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                  </div>
                </template>
              </el-popover>
            </div>
          </div>
        </el-scrollbar>
        <el-empty
          v-else-if="!CopilotCliSetup.skillsLoading"
          :description="I18nT('common.skills.noSkills')"
        />
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { onMounted } from 'vue'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { CopilotCliSetup } from './setup'

  onMounted(() => {
    CopilotCliSetup.refreshSkills()
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
    }
  }
</style>
