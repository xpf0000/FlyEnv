<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <template v-if="isMacOS">
            <el-radio-group v-model="libSrc" size="small">
              <template v-if="hasStatic">
                <el-radio-button value="static">Static</el-radio-button>
              </template>
              <template v-if="showBrewLib !== false">
                <el-radio-button value="brew">Homebrew</el-radio-button>
              </template>
              <template v-if="showPortLib !== false">
                <el-radio-button value="port">MacPorts</el-radio-button>
              </template>
            </el-radio-group>
          </template>
          <template v-else-if="isWindows">
            <span> {{ title }} </span>
            <el-button v-if="url" class="button" link @click="openURL(url)">
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              ></yb-icon>
            </el-button>
          </template>
          <template v-else-if="isLinux">
            <el-radio-group v-model="libSrc" size="small">
              <template v-if="hasStatic">
                <el-radio-button value="static">Static</el-radio-button>
              </template>
              <template v-if="showBrewLib !== false">
                <el-radio-button value="brew">Homebrew</el-radio-button>
              </template>
            </el-radio-group>
          </template>
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
    <template v-if="isMacOS">
      <template v-if="libSrc === 'brew'">
        <BrewVM :type-flag="typeFlag" />
      </template>
      <template v-else-if="libSrc === 'port'">
        <PortVM :type-flag="typeFlag" />
      </template>
      <template v-else-if="libSrc === 'static'">
        <StaticVM :type-flag="typeFlag" />
      </template>
    </template>
    <template v-else-if="isWindows">
      <StaticVM :type-flag="typeFlag" />
    </template>
    <template v-else-if="isLinux">
      <template v-if="libSrc === 'brew'">
        <BrewVM :type-flag="typeFlag" />
      </template>
      <template v-else-if="libSrc === 'static'">
        <StaticVM :type-flag="typeFlag" />
      </template>
    </template>
    <template v-if="!isWindows && showFooter" #footer>
      <template v-if="taskEnd">
        <el-button type="primary" @click.stop="taskConfirm">{{ I18nT('base.confirm') }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'
  import type { AllAppModule } from '@/core/type'
  import { Setup } from '@/components/VersionManager/setup'
  import BrewVM from './brew/index.vue'
  import PortVM from './port/index.vue'
  import StaticVM from './static/index.vue'

  const props = withDefaults(
    defineProps<{
      typeFlag: AllAppModule
      hasStatic?: boolean
      showBrewLib?: boolean
      showPortLib?: boolean
      title: string
      url?: string
    }>(),
    {
      hasStatic: false,
      showBrewLib: true,
      showPortLib: true
    }
  )

  const { libSrc, showFooter, taskEnd, taskCancel, taskConfirm, loading, reFetch, openURL } = Setup(
    props.typeFlag,
    props.hasStatic
  )

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })
  const isWindows = computed(() => {
    return window.Server.isWindows
  })
  const isLinux = computed(() => {
    return window.Server.isLinux
  })
</script>
