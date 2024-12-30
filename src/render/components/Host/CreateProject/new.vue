<template>
  <el-dialog
    v-model="show"
    :title="$t('host.newProject')"
    width="600px"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    class="host-edit new-project"
    style="width: 600px"
    @closed="closedFn"
  >
    <template #header>
      <div class="flex items-center justify-between">
        <span>{{ I18nT('host.newProject') }}</span>
        <el-radio-group v-model="ProjectSetup.tab" class="flex-shrink-0" size="small">
          <el-radio-button value="PHP" label="PHP"></el-radio-button>
          <el-radio-button value="NodeJS" label="NodeJS"></el-radio-button>
        </el-radio-group>
        <div></div>
      </div>
    </template>
    <template #default>
      <div class="flex flex-col gap-4 h-[500px] overflow-hidden">
        <PHP v-if="ProjectSetup.tab === 'PHP'" />
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { ProjectSetup } from '@/components/Host/CreateProject/project'
  import PHP from './php.vue'
  import { I18nT } from '@shared/lang'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  defineExpose({
    show,
    onSubmit,
    onClosed,
    callback
  })
</script>
