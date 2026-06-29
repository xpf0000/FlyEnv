<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('copilotCli.skills') }}</span>
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
              <el-tooltip
                v-if="item.path"
                :content="I18nT('base.copy')"
                placement="top"
                :show-after="300"
              >
                <el-button size="small" circle :icon="CopyDocument" @click="copyText(item.path)" />
              </el-tooltip>
            </div>
          </div>
        </el-scrollbar>
        <el-empty
          v-else-if="!CopilotCliSetup.skillsLoading"
          :description="I18nT('copilotCli.noSkills')"
        />
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { CopilotCliSetup } from './setup'
  import { CopyDocument } from '@element-plus/icons-vue'
  import { clipboard } from '@/util/NodeFn'
  import { MessageSuccess } from '@/util/Element'

  const copyText = (text: string) => {
    clipboard.writeText(text)
    MessageSuccess(I18nT('base.copySuccess'))
  }

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
