<template>
  <el-popover
    ref="popper"
    effect="dark"
    popper-class="host-list-poper"
    placement="left-start"
    :show-arrow="false"
    width="auto"
    @before-enter="actions.fetchEnvironment()"
  >
    <ul v-poper-fix class="host-list-menu">
      <li @click.stop="manage">
        <SetUp width="17" height="17" />
        <span class="ml-3">{{ I18nT('mysql.manage') }}</span>
      </li>
      <li class="path-set" :class="state" @click.stop="doChange">
        <template v-if="loading">
          <el-button style="width: auto; height: auto" text :loading="true"></el-button>
        </template>
        <template v-else>
          <yb-icon
            class="current"
            :class="{
              'text-blue-500': isInAppEnv,
              'opacity-100': isInAppEnv
            }"
            :svg="import('@/svg/select.svg?raw')"
            width="17"
            height="17"
          />
        </template>
        <span class="ml-3">{{ I18nT('base.addToPath') }}</span>
      </li>
      <li @click.stop="doSetAlias">
        <yb-icon class="current" :svg="import('@/svg/aliase.svg?raw')" width="17" height="17" />
        <span class="ml-3">{{ I18nT('service.setaliase') }}</span>
      </li>
      <template v-if="isWindows">
        <li @click.stop="remove">
          <yb-icon :svg="import('@/svg/trash.svg?raw')" width="17" height="17" />
          <span class="ml-3">{{ I18nT('common.action.delete') }}</span>
        </li>
      </template>
    </ul>
    <template #reference>
      <el-button link class="status">
        <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
      </el-button>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { SetUp } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { dirname } from '@/util/path-browserify'
  import { InstallationActionsManager as actions, ServiceActionStore } from './installations'

  const props = defineProps<{ item: ModuleInstalledItem }>()
  const isWindows = !!window.Server.isWindows
  const popper = ref()
  const loading = computed(() => ServiceActionStore.pathSeting?.[props.item.bin] ?? false)
  const isInAppEnv = computed(() => ServiceActionStore.isInAppEnv(props.item))
  const state = computed(() => {
    if (!ServiceActionStore.allPath.length) return ''
    return ServiceActionStore.allPath.includes(dirname(props.item.bin)) ? 'seted' : 'noset'
  })
  const doSetAlias = () => {
    popper.value.hide()
    actions.aliases(props.item)
  }
  const doChange = () => actions.environment(props.item)
  const manage = () => {
    popper.value.hide()
    actions.manage(props.item)
  }
  const remove = () => {
    popper.value.hide()
    actions.removeService(props.item)
  }
</script>
