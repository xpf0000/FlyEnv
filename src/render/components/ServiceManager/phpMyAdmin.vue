<template>
  <el-dialog
    v-model="show"
    title="phpMyAdmin"
    width="500px"
    :destroy-on-close="true"
    @closed="closedFn"
  >
    <div class="main-wapper">
      <template v-if="!phpMyAdminStore.fetching">
        <span>{{ I18nT('host.phpMyAdminInstallTips') }}</span>
      </template>
      <template v-else>
        <div style="display: flex; align-items: center; justify-content: center; padding: 15px">
          <el-progress type="circle" :percentage="phpMyAdminStore.percent" :status="state" />
        </div>
      </template>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <template v-if="!phpMyAdminStore.fetching">
          <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
          <el-button type="primary" @click="doRun">{{ I18nT('base.confirm') }}</el-button>
        </template>
        <template v-else>
          <el-button
            type="primary"
            :disabled="phpMyAdminStore.percent < 100"
            :loading="phpMyAdminStore.percent < 100"
            @click="doSubmit"
            >{{ I18nT('base.confirm') }}</el-button
          >
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { BrewStore } from '@/store/brew'
  import { PhpMyAdminTask } from '@/components/ServiceManager/service'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { I18nT } from '@shared/lang'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const phpMyAdminStore = PhpMyAdminTask

  const brewStore = BrewStore()

  const phpVersions = computed(() => {
    const set: Set<number> = new Set()
    return (
      brewStore.module('php').installed.filter((p) => {
        if (p.version && p.num) {
          if (!set.has(p.num)) {
            set.add(p.num)
            return true
          }
          return false
        }
        return false
      }) ?? []
    )
  })

  const state = ref('')

  const doRun = () => {
    PhpMyAdminTask.fetching = true
    const php = [...phpVersions.value]
      ?.sort((a, b) => {
        const anum = a?.num ?? 0
        const bnum = b?.num ?? 0
        return anum - bnum
      })
      ?.pop()?.num
    IPC.send('app-fork:host', 'addPhpMyAdminSite', php).then((key: string, res: any) => {
      if (res?.code === 200) {
        PhpMyAdminTask.percent = res.msg
      } else if (res?.code === 0) {
        PhpMyAdminTask.percent = 100
        state.value = 'success'
        IPC.off(key)
      } else if (res?.code === 1) {
        state.value = 'error'
        IPC.off(key)
        MessageError(res?.msg)
      }
    })
  }

  const doSubmit = () => {
    show.value = false
    callback(true)
    nextTick().then(() => {
      PhpMyAdminTask.fetching = false
      PhpMyAdminTask.percent = 0
    })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
