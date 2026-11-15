<template>
  <section class="memory-maintenance">
    <div class="maintenance-content">
      <header class="maintenance-heading">
        <div
          ><span class="maintenance-eyebrow">MEMORY CARE</span><h1>{{ T('maintenance') }}</h1
          ><p>{{ T('maintenanceIntro') }}</p></div
        >
        <span class="maintenance-local"><i />{{ T('maintenanceLocal') }}</span>
      </header>
      <div class="maintenance-actions">
        <article class="maintenance-card maintenance-backup">
          <span class="maintenance-icon"><Download aria-hidden="true" /></span>
          <div
            ><h2>{{ T('maintenanceBackup') }}</h2
            ><p>{{ T('maintenanceBackupHelp') }}</p></div
          >
          <button class="maintenance-button primary" :disabled="care.blocked" @click="care.backup()"
            ><Loading
              v-if="care.busy && care.operation?.kind === 'backup'"
              class="spinning"
              aria-hidden="true"
            /><Download v-else aria-hidden="true" />{{ T('maintenanceBackupAction') }}</button
          >
          <div v-if="care.lastBackup" class="maintenance-receipt">
            <span
              >{{ T('maintenanceLastBackup') }} · {{ displayDate(care.lastBackup.createdAt) }}</span
            >
            <button
              :title="care.lastBackup.path"
              :disabled="care.opening[care.lastBackup.path]"
              @click="care.openDirectory(care.lastBackup.path)"
              ><FolderOpened aria-hidden="true" /><span>{{ care.lastBackup.path }}</span></button
            >
          </div>
        </article>
        <article class="maintenance-card">
          <span class="maintenance-icon muted"><Upload aria-hidden="true" /></span>
          <div
            ><h2>{{ T('maintenanceRestore') }}</h2
            ><p>{{ T('maintenanceRestoreHelp') }}</p></div
          >
          <button class="maintenance-button" :disabled="care.blocked" @click="care.restore()"
            ><Loading
              v-if="care.busy && care.operation?.kind === 'restore'"
              class="spinning"
              aria-hidden="true"
            /><Upload v-else aria-hidden="true" />{{ T('maintenanceRestoreAction') }}</button
          >
          <div v-if="care.lastRestore?.safetyBackupPath" class="maintenance-receipt">
            <span>{{ T('maintenanceSafetyBackup') }}</span>
            <button
              :title="care.lastRestore.safetyBackupPath"
              :disabled="care.opening[care.lastRestore.safetyBackupPath]"
              @click="care.openDirectory(care.lastRestore.safetyBackupPath)"
              ><FolderOpened aria-hidden="true" /><span>{{
                care.lastRestore.safetyBackupPath
              }}</span></button
            >
          </div>
        </article>
      </div>
      <div
        v-if="care.operation"
        class="maintenance-operation"
        :class="{ warning: care.operation.result && care.operation.result.outcome !== 'success' }"
        role="status"
        aria-live="polite"
      >
        <Loading v-if="care.busy" class="spinning" aria-hidden="true" /><CircleCheck
          v-else-if="care.operation.result?.outcome === 'success'"
          aria-hidden="true"
        /><Warning v-else aria-hidden="true" />
        <div
          ><strong>{{ operationLabel }}</strong>
          <p v-if="care.operation.result?.outcome === 'unknown'">{{
            T('maintenanceUnknownHelp')
          }}</p>
          <button
            v-if="
              care.operation.result?.outcome !== 'success' &&
              care.operation.result?.data?.safetyBackupPath
            "
            class="maintenance-text-button"
            @click="care.openDirectory(care.operation.result.data.safetyBackupPath)"
            >{{ T('maintenanceOpenSafetyBackup') }}</button
          >
          <details v-if="care.operation.result?.data?.warnings?.length"
            ><summary>{{ T('technicalDetails') }}</summary
            ><p v-for="warning in care.operation.result.data.warnings" :key="warning">{{
              T(warning)
            }}</p></details
          >
        </div>
        <button
          v-if="care.operation.result?.outcome === 'unknown'"
          class="maintenance-button compact"
          @click="care.checkOperation()"
          >{{ T('maintenanceCheckResult') }}</button
        >
      </div>
      <section class="maintenance-check">
        <header class="maintenance-section-heading">
          <span class="maintenance-small-icon"><DocumentChecked aria-hidden="true" /></span
          ><div
            ><h2>{{ T('maintenanceProjectLinks') }}</h2
            ><p>{{ T('maintenanceProjectLinksHelp') }}</p></div
          >
          <button
            class="maintenance-button compact"
            :disabled="care.checking || care.busy"
            @click="care.refresh(true)"
            ><RefreshRight :class="{ spinning: care.checking }" aria-hidden="true" />{{
              T('maintenanceCheckAction')
            }}</button
          >
        </header>
        <div class="maintenance-check-result" :class="healthTone" role="status">
          <Loading v-if="care.checking" class="spinning" aria-hidden="true" /><CircleCheck
            v-else-if="healthTone === 'healthy'"
            aria-hidden="true"
          /><Warning v-else aria-hidden="true" />
          <strong>{{ healthLabel }}</strong>
        </div>
        <MemoryProjectPaths />
        <details v-if="report" class="maintenance-details">
          <summary>{{ T('technicalDetails') }}</summary>
          <div v-if="report" class="maintenance-check-stats">
            <div
              ><span>{{ T('maintenanceCurrentLinks') }}</span
              ><strong>{{ mappingLabel(report.primary.status) }}</strong></div
            >
            <div
              ><span>{{ T('maintenancePreviousLinks') }}</span
              ><strong>{{ mappingLabel(report.previous.status) }}</strong></div
            >
            <div
              ><span>{{ T('maintenanceUnlinked') }}</span
              ><strong>{{ recoverySummary(report).unmappedCount ?? T('notChecked') }}</strong></div
            >
          </div>

          <p v-for="warning in report.warnings" :key="warning.code">{{ T(warning.code) }}</p>
          <p v-if="report.primary.error_code">{{ T(report.primary.error_code) }}</p
          ><p v-if="report.previous.error_code">{{ T(report.previous.error_code) }}</p>
          <p v-if="report.unmappedProjectIds.length">{{ T('maintenanceUnlinkedHelp') }}</p
          ><code v-for="id in report.unmappedProjectIds" :key="id">{{ id }}</code>
        </details>
      </section>
      <section class="maintenance-storage">
        <FolderOpened class="maintenance-small-icon" aria-hidden="true" /><div
          ><h2>{{ T('dataDirectory') }}</h2
          ><p class="maintenance-path">{{
            care.runtimeResult?.data?.dataRoot ||
            T(care.runtimeResult?.error_code || 'maintenanceLoading')
          }}</p></div
        >
        <button
          class="maintenance-button compact"
          :disabled="
            !care.runtimeResult?.data?.dataRoot ||
            care.opening[care.runtimeResult?.data?.dataRoot ?? '']
          "
          @click="care.openDirectory(care.runtimeResult?.data?.dataRoot)"
          ><FolderOpened aria-hidden="true" />{{ T('openFolder') }}</button
        >
      </section>
      <p v-if="care.directoryError" class="maintenance-error" role="alert">{{
        T(care.directoryError)
      }}</p>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed, onMounted } from 'vue'
  import {
    Download,
    Upload,
    FolderOpened,
    RefreshRight,
    CircleCheck,
    Warning,
    Loading,
    DocumentChecked
  } from '@element-plus/icons-vue'
  import MemoryProjectPaths from './MemoryProjectPaths.vue'
  import { MemoryMaintenance as care } from './maintenance-manager'
  import { MemoryT as T } from './lang'
  import { displayDate, recoverySummary } from './presentation'
  const report = computed(() => care.inspection?.data)
  const healthTone = computed(() => {
    if (!report.value || care.inspection?.outcome !== 'success') return 'warning'
    const value = report.value
    return care.projectsResult?.outcome !== 'success' ||
      care.projectsResult.data?.some((project) => project.path_status !== 'available') ||
      value.warnings.length ||
      value.primary.status === 'invalid' ||
      value.previous.status === 'invalid' ||
      value.unmappedProjectIds.length
      ? 'warning'
      : 'healthy'
  })
  const healthLabel = computed(() => {
    if (care.checking) return T('maintenanceChecking')
    if (!report.value || care.inspection?.outcome !== 'success')
      return T(care.inspection?.error_code ?? 'maintenance_check_failed')
    if (report.value.warnings.length) return T('maintenanceCheckIncomplete')
    if (report.value.primary.status === 'invalid') return T('maintenanceLinksDamaged')
    if (report.value.unmappedProjectIds.length) return T('maintenanceLinksUnlinked')
    if (care.projectsResult?.outcome !== 'success')
      return T(care.projectsResult?.error_code || 'project_list_unavailable')
    if (care.projectsResult.data?.some((project) => project.path_status !== 'available'))
      return T('projectPathsNeedRelink')
    if (report.value.previous.status === 'invalid') return T('maintenancePreviousDamaged')
    return T('maintenanceLinksHealthy')
  })
  const mappingLabel = (status: string) => T(status === 'missing' ? 'maintenanceNoMapping' : status)
  const operationLabel = computed(() => {
    const operation = care.operation
    if (!operation) return ''
    if (operation.stage !== 'complete')
      return T(
        operation.stage === 'selecting'
          ? 'maintenanceSelecting'
          : operation.stage === 'confirming'
            ? 'maintenanceConfirming'
            : operation.kind === 'backup'
              ? 'maintenanceBackingUp'
              : 'maintenanceRestoring'
      )
    return T(
      operation.result?.outcome === 'success'
        ? operation.kind === 'backup'
          ? 'maintenanceBackupDone'
          : 'maintenanceRestoreDone'
        : (operation.result?.error_code ?? 'maintenance_failed')
    )
  })
  onMounted(() => void care.refresh(true))
</script>
<style scoped src="./maintenance.css"></style>
