<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <slot name="header-left">
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
                <template v-if="showSdkmanLib !== false">
                  <el-radio-button value="sdkman">SDKMAN</el-radio-button>
                </template>
              </el-radio-group>
              <el-button v-if="url" class="button" link @click="openURL(url)">
                <yb-icon
                  style="width: 20px; height: 20px; margin-left: 10px"
                  :svg="import('@/svg/http.svg?raw')"
                ></yb-icon>
              </el-button>
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
                <template v-if="showSdkmanLib !== false">
                  <el-radio-button value="sdkman">SDKMAN</el-radio-button>
                </template>
              </el-radio-group>
            </template>
          </slot>
        </div>
        <el-button class="button" :disabled="managerLoading" link @click="refresh">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': managerLoading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <StaticVM
      v-if="items !== undefined"
      :type-flag="typeFlag"
      :items="items"
      :fetching="managerLoading"
      @action="emit('action', $event)"
    />
    <template v-else-if="isMacOS">
      <template v-if="libSrc === 'brew'">
        <BrewVM :type-flag="typeFlag" />
      </template>
      <template v-else-if="libSrc === 'port'">
        <PortVM :type-flag="typeFlag" />
      </template>
      <template v-else-if="libSrc === 'static'">
        <StaticVM :type-flag="typeFlag" />
      </template>
      <template v-else-if="libSrc === 'sdkman'">
        <SdkmanVM :type-flag="typeFlag" />
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
      <template v-else-if="libSrc === 'sdkman'">
        <SdkmanVM :type-flag="typeFlag" />
      </template>
    </template>
    <template v-if="$slots.footer || (items === undefined && !isWindows && showFooter)" #footer>
      <slot name="footer">
        <template v-if="taskEnd">
          <el-button type="primary" @click.stop="taskConfirm">{{
            I18nT('base.confirm')
          }}</el-button>
        </template>
        <template v-else>
          <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
        </template>
      </slot>
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
  import SdkmanVM from './sdkman/index.vue'
  import type { StaticVersionItem } from './static/setup'

  const props = withDefaults(
    defineProps<{
      typeFlag: AllAppModule
      hasStatic?: boolean
      showBrewLib?: boolean
      showPortLib?: boolean
      showSdkmanLib?: boolean
      title: string
      url?: string
      items?: StaticVersionItem[]
      fetching?: boolean
    }>(),
    {
      hasStatic: false,
      showBrewLib: true,
      showPortLib: true,
      showSdkmanLib: false,
      fetching: undefined
    }
  )

  const emit = defineEmits<{
    refresh: []
    action: [item: StaticVersionItem]
  }>()

  const { libSrc, showFooter, taskEnd, taskCancel, taskConfirm, loading, reFetch, openURL } = Setup(
    props.typeFlag,
    props.hasStatic
  )
  const managerLoading = computed(() => props.fetching ?? loading.value)
  const refresh = () => (props.items !== undefined ? emit('refresh') : reFetch())

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
