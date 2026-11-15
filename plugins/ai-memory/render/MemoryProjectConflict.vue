<template>
  <el-dialog
    :model-value="care.relinkOperation?.stage === 'conflict'"
    :title="T('projectMergeTitle')"
    width="min(580px, 94vw)"
    class="memory-project-conflict"
    style="
      --el-dialog-bg-color: #101316;
      --el-text-color-primary: #e3ddcf;
      --el-text-color-regular: #bfc0b3;
      --el-text-color-secondary: #939b90;
      --el-border-color: #bca16a35;
      --el-border-color-light: #bca16a25;
      --el-fill-color-light: #ffffff04;
      border: 1px solid #bca16a45;
      border-radius: 12px;
    "
    :close-on-click-modal="false"
    @update:model-value="openChanged"
  >
    <div class="project-conflict-content">
      <p>{{ T('projectMergeQuestion') }}</p>
      <div class="project-conflict-pair"
        ><div
          ><strong>{{ care.relinkOperation?.project.name }}</strong
          ><span>{{ care.relinkOperation?.project.project_path }}</span></div
        ><span aria-hidden="true">↔</span
        ><div
          ><strong>{{ care.relinkOperation?.conflict?.name }}</strong
          ><span>{{ care.relinkOperation?.conflict?.project_path }}</span></div
        ></div
      >
      <button
        class="project-conflict-choice"
        type="button"
        @click="care.resolveProjectConflict('merge')"
        ><strong>{{ T('projectMergeSame') }}</strong
        ><span>{{ T('projectMergeKeepBoth') }}</span></button
      >
      <button
        class="project-conflict-choice"
        type="button"
        @click="care.resolveProjectConflict('reselect')"
        ><strong>{{ T('projectMergeDifferent') }}</strong
        ><span>{{ T('projectMergeKeepSeparate') }}</span></button
      >
    </div>
    <template #footer
      ><button
        class="project-conflict-cancel"
        type="button"
        @click="care.resolveProjectConflict('cancel')"
        >{{ T('cancel') }}</button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
  import { MemoryMaintenance as care } from './maintenance-manager'
  import { MemoryT as T } from './lang'
  function openChanged(value: boolean) {
    if (!value) care.resolveProjectConflict('cancel')
  }
</script>
<style scoped>
  .project-conflict-content {
    font-size: 14px;
    line-height: 1.6;
  }
  p {
    margin: 0 0 14px;
    color: var(--el-text-color-regular);
  }
  .project-conflict-pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 14px;
    margin-bottom: 16px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
  }
  .project-conflict-pair strong,
  .project-conflict-pair div > span {
    display: block;
  }
  .project-conflict-pair div > span {
    font-size: 12px;
    overflow-wrap: anywhere;
    color: var(--el-text-color-secondary);
  }
  .project-conflict-choice {
    display: block;
    width: 100%;
    padding: 14px;
    margin-top: 10px;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    color: var(--el-text-color-primary);
    background: var(--el-fill-color-light);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .project-conflict-choice:hover {
    border-color: #b69a5e;
  }
  .project-conflict-choice strong {
    display: block;
    font-size: 14px;
    font-weight: 500;
  }
  .project-conflict-choice span {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .project-conflict-choice:focus-visible,
  .project-conflict-cancel:focus-visible {
    outline: 2px solid #d6b774;
    outline-offset: 3px;
  }
  .project-conflict-cancel {
    padding: 7px 16px;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    color: var(--el-text-color-regular);
    background: transparent;
    cursor: pointer;
    font: inherit;
  }
  @media (max-width: 480px) {
    .project-conflict-pair {
      grid-template-columns: minmax(0, 1fr);
    }
    .project-conflict-pair > span {
      display: none;
    }
  }
</style>
