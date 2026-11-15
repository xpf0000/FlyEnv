<template>
  <div class="maintenance-projects">
    <header class="project-paths-heading">
      <div
        ><h3>{{ T('projectDirectories') }}</h3
        ><p>{{ T('projectRelinkHelp') }}</p></div
      >
      <button v-if="healthyCount" class="maintenance-text-button" @click="showAll = !showAll"
        >{{ T(showAll ? 'projectHideAvailable' : 'projectShowAll')
        }}<span v-if="!showAll"> · {{ care.projectsResult?.data?.length }}</span></button
      >
    </header>
    <p v-if="care.projectsResult?.outcome === 'failed'" class="project-path-warning" role="alert">{{
      T(care.projectsResult.error_code || 'project_list_unavailable')
    }}</p>
    <p v-else-if="!care.projectsResult || care.checking">{{ T('maintenanceLoading') }}</p>
    <p v-else-if="!care.projectsResult.data?.length">{{ T('projectNoMemories') }}</p>
    <p v-else-if="!showAll && !attentionCount" class="project-path-healthy">{{
      T('projectAllPathsAvailable')
    }}</p>
    <ul v-if="visibleProjects.length" class="project-path-list">
      <li v-for="project in visibleProjects" :key="project.projectId" class="project-path-row">
        <FolderOpened aria-hidden="true" /><div class="project-path-info"
          ><strong>{{ project.name }}</strong
          ><span :title="project.project_path">{{ project.project_path }}</span></div
        >
        <span
          class="project-path-state"
          :class="{ unavailable: project.path_status !== 'available' }"
          >{{
            T(
              project.path_status === 'available'
                ? 'projectPathAvailable'
                : project.path_status === 'missing'
                  ? 'projectPathMissing'
                  : 'projectPathUnavailable'
            )
          }}</span
        >
        <button
          class="maintenance-button compact"
          :disabled="care.blocked"
          :aria-label="`${project.name} · ${T('projectChooseNewPath')}`"
          @click="care.relinkProject(project)"
          ><Loading
            v-if="care.busy && care.relinkOperation?.project.projectId === project.projectId"
            class="spinning"
            aria-hidden="true"
          /><FolderOpened v-else aria-hidden="true" />{{
            T(project.path_status === 'available' ? 'projectChangePath' : 'projectChooseNewPath')
          }}</button
        >
      </li>
    </ul>
    <div
      v-if="care.relinkOperation"
      class="project-relink-result"
      :class="{
        warning: care.relinkOperation.result && care.relinkOperation.result.outcome !== 'success'
      }"
      role="status"
      aria-live="polite"
    >
      <div
        ><strong>{{ resultLabel }}</strong
        ><p v-if="care.relinkOperation.result?.data" class="project-path-output"
          >{{ care.relinkOperation.result.data.name }} ·
          {{ care.relinkOperation.result.data.project_path }}</p
        ><p v-if="care.relinkOperation.result?.outcome === 'unknown'">{{
          T('projectRelinkUnknownHelp')
        }}</p>
        <details v-if="care.relinkOperation.result?.warnings?.length"
          ><summary>{{ T('technicalDetails') }}</summary
          ><p v-for="warning in care.relinkOperation.result.warnings" :key="warning.code">{{
            T(warning.code)
          }}</p></details
        >
      </div>
      <button
        v-if="care.relinkOperation.result?.outcome === 'unknown'"
        class="maintenance-button compact"
        :disabled="care.busy"
        @click="care.retryRelink()"
        >{{ T('projectRelinkRetry') }}</button
      >
    </div>
    <MemoryProjectConflict />
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { FolderOpened, Loading } from '@element-plus/icons-vue'
  import MemoryProjectConflict from './MemoryProjectConflict.vue'
  import { MemoryMaintenance as care } from './maintenance-manager'
  import { MemoryT as T } from './lang'
  const showAll = ref(false)
  const attentionCount = computed(
    () =>
      care.projectsResult?.data?.filter((project) => project.path_status !== 'available').length ??
      0
  )
  const healthyCount = computed(
    () =>
      care.projectsResult?.data?.filter((project) => project.path_status === 'available').length ??
      0
  )
  const visibleProjects = computed(() =>
    [...(care.projectsResult?.data ?? [])]
      .filter((project) => showAll.value || project.path_status !== 'available')
      .sort((a, b) => Number(a.path_status === 'available') - Number(b.path_status === 'available'))
  )
  const resultLabel = computed(() => {
    const operation = care.relinkOperation
    if (!operation) return ''
    if (operation.stage === 'conflict') return T('projectMergeWaiting')
    if (operation.stage !== 'complete')
      return T(
        operation.stage === 'selecting'
          ? 'maintenanceSelecting'
          : operation.stage === 'confirming'
            ? 'projectRelinkConfirming'
            : 'projectRelinking'
      )
    return T(
      operation.result?.outcome === 'success'
        ? operation.result.data?.merged
          ? 'projectMergeDone'
          : 'projectRelinkDone'
        : operation.result?.error_code || 'project_relink_failed'
    )
  })
</script>
<style scoped src="./maintenance-projects.css"></style>
