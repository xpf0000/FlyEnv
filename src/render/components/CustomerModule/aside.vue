<template>
  <li
    :class="{
      active: isActive
    }"
    class="non-draggable"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :key="iconKey" :svg="itemIcon" style="padding: 4px" width="28" height="28" />
      </div>
      <span class="title">{{ item.label }}</span>
    </div>

    <template v-if="item.isService">
      <el-switch
        v-model="serviceRunning"
        :disabled="serviceDisabled"
        @click.stop="stopNav"
        @change="switchChange()"
      >
      </el-switch>
    </template>
  </li>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { ModuleCustomer } from '@/core/ModuleCustomer'
  import Router from '@/router'
  import { AppCustomerModule } from '@/core/Module'
  import { AppStore } from '@/store/app'
  import { uuid } from '@/util/Index'

  const props = defineProps<{
    item: ModuleCustomer
  }>()

  const appStore = AppStore()

  const stopNav = () => {}

  const iconKey = ref(uuid())

  const itemIcon = computed(() => {
    return AppCustomerModule.module.find((f) => f.id === props.item.id)?.icon ?? ''
  })

  watch(itemIcon, () => {
    iconKey.value = uuid()
  })

  const isActive = computed(() => {
    return appStore.currentPage === `/${props.item.id}`
  })

  const serviceRunning = computed(() => {
    return props.item.item.some((s) => s.run)
  })

  const serviceDisabled = computed(() => {
    return props.item.item.length === 0 || props.item.item.some((s) => s.running)
  })

  const switchChange = () => {
    if (serviceRunning.value) {
      props.item.stop()
    } else {
      props.item.start()
    }
  }

  const nav = () => {
    return new Promise((resolve, reject) => {
      const path = `/${props.item.id}`
      if (appStore.currentPage === path) {
        reject(new Error('Path Not Change'))
        return
      }
      AppCustomerModule.currentModule = AppCustomerModule.module.find((f) => f.id === props.item.id)
      Router.push({
        path: '/customer-module'
      })
        .then()
        .catch()
      appStore.currentPage = path
      resolve(true)
    })
  }
</script>
