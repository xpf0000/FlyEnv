<template>
  <el-card class="h-full overflow-hidden run-panel">
    <div class="w-full h-full overflow-hidden flex flex-col">
      <template v-if="store.running">
        <div class="w-full flex-1 overflow-hidden p-2">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else>
        <el-scrollbar class="flex-1">
          <el-form label-position="top" class="px-2" @submit.prevent>
            <el-form-item :label="I18nT('aicli.provider')">
              <div class="flex w-full gap-2">
                <el-select v-model="store.providerId" class="flex-1" @change="store.fetchModels()">
                  <el-option
                    v-for="p in store.providers"
                    :key="p.id"
                    :label="p.label"
                    :value="p.id"
                  />
                </el-select>
                <el-dropdown trigger="click" @command="store.addProvider($event)">
                  <el-button>{{ I18nT('aicli.addProvider') }}</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="p in store.presets"
                        :key="p.kind"
                        :command="p.kind"
                        >{{ p.label }}</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </el-form-item>

            <template v-if="store.provider">
              <el-form-item :label="I18nT('aicli.baseURL')">
                <el-input v-model="store.provider.baseURL" @blur="store.saveProviders()" />
              </el-form-item>
              <el-form-item v-if="store.provider.kind !== 'ollama'" :label="I18nT('aicli.apiKey')">
                <el-input
                  v-model="store.provider.apiKey"
                  type="password"
                  show-password
                  @blur="store.saveProviders()"
                />
              </el-form-item>
              <el-form-item :label="I18nT('aicli.model')">
                <div class="flex w-full gap-2">
                  <el-select
                    v-model="store.model"
                    class="flex-1"
                    filterable
                    allow-create
                    :loading="store.fetchingModels"
                  >
                    <el-option v-for="m in store.modelList" :key="m" :label="m" :value="m" />
                  </el-select>
                  <el-button :loading="store.fetchingModels" @click="store.fetchModels()">
                    {{ I18nT('aicli.fetchModels') }}
                  </el-button>
                </div>
              </el-form-item>
            </template>

            <el-form-item :label="I18nT('aicli.workDir')">
              <div class="flex w-full gap-2">
                <el-input v-model="store.workDir" class="flex-1" readonly />
                <el-button @click="pickDir">{{ I18nT('aicli.select') }}</el-button>
              </div>
            </el-form-item>
            <el-form-item :label="I18nT('aicli.envVars')">
              <el-input v-model="store.envText" type="textarea" :rows="3" placeholder="KEY=value" />
            </el-form-item>
            <el-form-item :label="I18nT('aicli.shell')">
              <el-radio-group v-model="store.shell">
                <template v-if="isWin">
                  <el-radio-button value="cmd" label="CMD" />
                  <el-radio-button value="powershell" label="PowerShell" />
                  <el-radio-button value="wsl" label="WSL" />
                </template>
                <template v-else>
                  <el-radio-button value="bash" label="bash" />
                  <el-radio-button value="zsh" label="zsh" />
                </template>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </el-scrollbar>
        <div class="flex-shrink-0 pt-3 flex gap-2">
          <el-button type="primary" @click="launch">{{ I18nT('aicli.applyAndOpen') }}</el-button>
          <el-button v-if="store.configFileForPlatform()" @click="store.openConfig()">
            {{ I18nT('base.configFile') }}
          </el-button>
        </div>
      </template>
    </div>
    <template v-if="store.running" #footer>
      <el-button @click="store.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, onUnmounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { AICliSetup } from './setup'
  import { chooseFolder } from '@/util/File'

  const store = AICliSetup
  const xtermDom = ref()
  const isWin = window.Server.isWindows

  const pickDir = () => {
    chooseFolder()
      .then((p: string) => {
        store.workDir = p
      })
      .catch(() => {})
  }

  const launch = () => {
    store.applyAndLaunch(xtermDom)
  }

  onUnmounted(() => {
    store?.xterm?.unmounted?.()
  })
</script>
