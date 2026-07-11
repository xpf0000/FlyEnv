<template>
  <div class="soft-index-panel main-right-panel startup-group-page">
    <div class="flex flex-shrink-0 items-center justify-between gap-4 py-3">
      <div>
        <h2 class="text-xl font-semibold">{{ I18nT('common.startupGroup.title') }}</h2>
        <p class="text-sm text-zinc-500">{{ I18nT('common.startupGroup.description') }}</p>
      </div>
      <el-tooltip
        v-if="isAddLocked"
        placement="left"
        :content="I18nT('common.startupGroup.licenseTips')"
      >
        <el-button :icon="Lock" type="warning" @click="toLicense">
          {{ I18nT('common.startupGroup.add') }}
        </el-button>
      </el-tooltip>
      <el-button v-else type="primary" @click="openEditor()">
        {{ I18nT('common.startupGroup.add') }}
      </el-button>
    </div>

    <div class="main-block">
      <el-scrollbar>
        <el-empty v-if="groups.length === 0" :description="I18nT('common.startupGroup.noGroups')">
          <el-button type="primary" @click="openEditor()">
            {{ I18nT('common.startupGroup.add') }}
          </el-button>
        </el-empty>

        <div v-else class="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          <GroupCard
            v-for="group in groups"
            :key="group.id"
            :group="group"
            :is-default="config.defaultStartupGroupId === group.id"
            @group-change="executeGroup"
            @member-change="executeMember"
            @edit="openEditor"
            @delete="removeGroup"
            @default-change="defaultChange"
          />
        </div>
      </el-scrollbar>
    </div>

    <GroupEditor v-model="editorVisible" :group="editingGroup" @saved="refreshAfterMutation" />
  </div>
</template>

<script lang="ts" setup>
  import { Lock } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'
  import { computed, onMounted, ref, watch } from 'vue'

  import { I18nT } from '@lang/index'
  import { SetupStore } from '@/components/Setup/store'
  import {
    isStartupGroupCreationLocked,
    type StartupGroup,
    type StartupGroupItem,
    type StartupGroupRunResult
  } from '@/core/StartupGroup'
  import Router from '@/router'
  import { AppStore } from '@/store/app'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import GroupCard from './GroupCard.vue'
  import GroupEditor from './GroupEditor.vue'
  import { StartupGroupSetup } from './setup'
  import { useStartupGroupStore } from './store'

  const store = useStartupGroupStore()
  const { groups, config } = store
  const appStore = AppStore()
  const setupStore = SetupStore()
  const isAddLocked = computed(() =>
    isStartupGroupCreationLocked(setupStore.isActive, groups.value.length)
  )
  const editorVisible = ref(false)
  const editingGroup = ref<StartupGroup>()
  const itemLabel = (item: StartupGroupItem) =>
    StartupGroupSetup.getMemberDisplayTitle(item, I18nT('common.startupGroup.noRemark'))

  const toLicense = () => {
    setupStore.tab = 'licenses'
    appStore.currentPage = '/setup'
    Router.push({ path: '/setup' }).then().catch()
  }

  const openEditor = (group?: StartupGroup) => {
    if (!group && isAddLocked.value) {
      toLicense()
      return
    }
    editingGroup.value = group
    editorVisible.value = true
  }

  const resultMessage = (result: StartupGroupRunResult) => {
    const lines = result.members.map((member) => {
      const error = member.error ? `: ${member.error}` : ''
      return `${itemLabel(member.item)} — ${I18nT(`common.startupGroup.outcome.${member.outcome}`)}${error}`
    })
    return lines.join('<br/>') || I18nT('base.success')
  }

  const execute = async (operation: () => Promise<StartupGroupRunResult | undefined>) => {
    try {
      const result = await operation()
      if (!result) return
      const hasError = result.members.some((item) => ['failed', 'invalid'].includes(item.outcome))
      if (hasError) MessageError(resultMessage(result))
      else MessageSuccess(resultMessage(result))
    } catch (error) {
      MessageError(error instanceof Error ? error.message : `${error}`)
    }
  }

  const executeGroup = (group: StartupGroup, enabled: boolean) =>
    execute(() => StartupGroupSetup.setGroupEnabled(group, enabled))

  const executeMember = (group: StartupGroup, item: StartupGroupItem, enabled: boolean) =>
    execute(() => StartupGroupSetup.setMemberEnabled(group, item, enabled))

  const ensureSources = () =>
    StartupGroupSetup.ensureSources(groups.value).catch((error) => {
      MessageError(error instanceof Error ? error.message : `${error}`)
    })

  const removeGroup = async (group: StartupGroup) => {
    try {
      await ElMessageBox.confirm(
        I18nT('common.startupGroup.deleteConfirm', { name: group.name }),
        I18nT('host.warning'),
        { type: 'warning' }
      )
      await store.remove(group.id)
      await ensureSources()
    } catch {}
  }

  const defaultChange = async (group: StartupGroup, enabled: boolean) => {
    const saved = await store.setDefault(enabled ? group.id : undefined)
    if (!saved) MessageError(I18nT('common.startupGroup.defaultEmptyDisabled'))
  }

  const refreshAfterMutation = async () => {
    editingGroup.value = undefined
    await ensureSources()
  }

  watch(
    () => groups.value.map((group) => `${group.id}:${group.updatedAt}`).join('|'),
    ensureSources
  )
  onMounted(ensureSources)
</script>

<style scoped lang="scss">
  .startup-group-main {
    overflow: auto !important;
  }
</style>
