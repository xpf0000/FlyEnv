<template>
  <el-card class="version-manager" :header="$t('util.nodeToolInstall')">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ $t('util.nodeToolInstall') }} </span>
        </div>
        <el-button v-if="toolInstallEnd" type="primary" @click.stop="endInstall">
          {{ $t('base.confirm') }}
        </el-button>
      </div>
    </template>
    <template v-if="toolInstalling">
      <div ref="logRef" class="logs cli-to-html">
        {{ logs?.join('') ?? '' }}
      </div>
    </template>
    <template v-else>
      <el-form style="margin-top: 15px" label-position="left" label-width="150px">
        <el-form-item :label="$t('util.nodeToolChoose')">
          <el-radio-group v-model="form.tool">
            <el-radio-button key="fnm" label="fnm">fnm</el-radio-button>
            <el-radio-button key="nvm" label="nvm">nvm</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="$t('util.nodeToolInstallBy')">
          <el-radio-group v-model="form.installBy">
            <template v-if="form.tool === 'nvm'">
              <el-radio-button key="shell" label="shell">{{
                $t('util.nodeToolShell')
              }}</el-radio-button>
            </template>
            <el-radio-button key="brew" :disabled="!hasBrew" label="brew">Homebrew</el-radio-button>
            <el-radio-button key="port" :disabled="!hasPort" label="port">Macports</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-button type="primary" @click.stop="doInstallTool">{{
          $t('util.nodeToolInstallBtn')
        }}</el-button>
      </el-form>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, computed, watch, nextTick, onMounted } from 'vue'
  import { NodejsStore } from '@/components/Nodejs/node'

  const nodejsStore = NodejsStore()

  const logRef = ref()
  const form = ref({
    tool: 'fnm',
    installBy: ''
  })

  const hasBrew = !!global.Server.BrewCellar
  const hasPort = !!global.Server.MacPorts
  if (hasPort) {
    form.value.installBy = 'port'
  } else if (hasBrew) {
    form.value.installBy = 'brew'
  }

  const toolInstalling = computed(() => {
    return nodejsStore.toolInstalling
  })

  const toolInstallEnd = computed(() => {
    return nodejsStore.toolInstallEnd
  })

  const logs = computed(() => {
    return nodejsStore.logs
  })

  const logLength = computed(() => {
    return logs.value.length
  })

  const logScroll = () => {
    nextTick().then(() => {
      let container: HTMLElement = logRef.value as any
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  }

  watch(logLength, () => {
    logScroll()
  })

  const endInstall = () => {
    nodejsStore.toolInstalling = false
    nodejsStore.chekTool()
  }

  const doInstallTool = () => {
    nodejsStore.doInstallTool(form.value as any)?.then()
  }

  onMounted(() => {
    logScroll()
    if (nodejsStore.toolInstallEnd) {
      nodejsStore.chekTool()
    }
  })
</script>
