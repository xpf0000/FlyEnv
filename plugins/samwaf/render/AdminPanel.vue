<template>
  <template v-if="version">
    <el-button style="color: #01cc74" class="button" link @click.stop="openPanel">
      <yb-icon style="width: 20px; height: 20px; margin-left: 10px" :svg="icon" />
    </el-button>
    <el-dialog
      v-model="dialogVisible"
      :title="SamWafT('adminPanelTitle')"
      width="420px"
      append-to-body
    >
      <p class="mb-2">{{ SamWafT('initialPasswordTip') }}</p>
      <el-input :model-value="initialPassword" readonly />
      <p class="mt-2 text-xs opacity-70">{{ SamWafT('initialPasswordFileHint') }}</p>
      <template #footer>
        <el-button type="primary" @click="gotoPanel">{{ SamWafT('openAdminPanel') }}</el-button>
      </template>
    </el-dialog>
  </template>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import IPC from '@/util/IPC'
  import { shell } from '@/util/NodeFn'
  import type { SoftInstalled } from '@/store/brew'
  import { SamWafT } from './lang'
  import icon from './samwaf.svg?raw'

  const props = defineProps<{ version?: SoftInstalled }>()

  const dialogVisible = ref(false)
  const initialPassword = ref('')
  let panelUrl = ''

  // Fork resolves wrap the payload as { code: 0, data } — same convention as
  // plugins/opensearch/render/store.ts.
  const fetchAdminInfo = (): Promise<{ url: string; initialPassword: string } | undefined> => {
    return new Promise((resolve) => {
      IPC.send('app-fork:samwaf', 'adminInfo', JSON.parse(JSON.stringify(props.version))).then(
        (key: string, res: any) => {
          IPC.off(key)
          resolve(res?.code === 0 ? res.data : undefined)
        }
      )
    })
  }

  const openExternal = (url: string) => {
    shell.openExternal(url).then().catch()
  }

  const openPanel = async () => {
    if (!props.version?.run) return
    const info = await fetchAdminInfo()
    if (!info?.url) return
    panelUrl = info.url
    // Fresh installs carry a random password; surface it before opening.
    if (info.initialPassword) {
      initialPassword.value = info.initialPassword
      dialogVisible.value = true
      return
    }
    openExternal(panelUrl)
  }

  const gotoPanel = () => {
    dialogVisible.value = false
    if (panelUrl) openExternal(panelUrl)
  }
</script>
