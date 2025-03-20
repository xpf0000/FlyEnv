<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
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
    <template v-if="libSrc === 'brew'">
      <BrewVM :type-flag="typeFlag" />
    </template>
    <template v-else-if="libSrc === 'port'">
      <PortVM :type-flag="typeFlag" />
    </template>
    <template v-else-if="libSrc === 'static'">
      <StaticVM :type-flag="typeFlag" />
    </template>

    <template v-if="showFooter" #footer>
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
  import { I18nT } from '@lang/index'
  import type { AllAppModule } from '@/core/type'
  import { Setup } from '@/components/VersionManager/setup'
  import BrewVM from './brew/index.vue'
  import PortVM from './port/index.vue'
  import StaticVM from './static/index.vue'

  const props = withDefaults(
    defineProps<{
      typeFlag: AllAppModule
      hasStatic: boolean
      showBrewLib: boolean
      showPortLib: boolean
    }>(),
    {
      hasStatic: false,
      showBrewLib: true,
      showPortLib: true
    }
  )

  const { libSrc, showFooter, taskEnd, taskCancel, taskConfirm, loading, reFetch } = Setup(
    props.typeFlag,
    props.hasStatic
  )
</script>
