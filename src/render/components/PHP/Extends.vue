<template>
  <el-drawer
    v-model="show"
    size="80%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="php-extensions">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ I18nT('php.phpExtension') }}</span>
        </div>
        <el-button type="primary" class="shrink0" :disabled="!extensionDir" @click="openDir">{{
          I18nT('base.open')
        }}</el-button>
      </div>
      <div class="main-wapper">
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="left">
                <el-radio-group v-model="lib" size="small">
                  <template v-if="isHomeBrew">
                    <el-radio-button value="homebrew">Homebrew</el-radio-button>
                  </template>
                  <template v-else-if="isMacPorts">
                    <el-radio-button value="macports">Macports</el-radio-button>
                  </template>
                  <el-radio-button value="phpwebstudy">{{
                    I18nT('php.extensionsLibDefault')
                  }}</el-radio-button>
                </el-radio-group>
              </div>
              <el-button class="button" :disabled="loading" link @click="reFetch">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  class="refresh-icon"
                  :class="{ 'fa-spin': loading }"
                ></yb-icon>
              </el-button>
            </div>
          </template>

          <template v-if="lib === 'homebrew'">
            <BrewVM :version="version" />
          </template>
          <template v-else-if="lib === 'macports'"> </template>
          <template v-else-if="lib === 'phpwebstudy'"> </template>

          <template v-if="showFooter" #footer>
            <template v-if="taskEnd">
              <el-button type="primary" @click.stop="taskConfirm">{{
                I18nT('base.confirm')
              }}</el-button>
            </template>
            <template v-else>
              <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
            </template>
          </template>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { type SoftInstalled } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import BrewVM from './Extension/Homebrew/index.vue'
  import { Setup } from '@/components/PHP/Extension/setup'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const {
    lib,
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel,
    loading,
    reFetch,
    extensionDir,
    openDir
  } = Setup(props.version)

  const isMacPorts = computed(() => {
    return props.version?.flag === 'macports'
  })
  const isHomeBrew = computed(() => {
    return props.version?.path?.includes(global?.Server?.BrewCellar ?? '-----')
  })

  if (isMacPorts.value) {
    lib.value = 'macports'
  } else if (isHomeBrew.value) {
    lib.value = 'homebrew'
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
