<template>
  <el-switch v-model="serviceRunning" :disabled="serviceDisabled" @click.stop="stopNav">
  </el-switch>
</template>
<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed } from 'vue'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import { AppServiceModule } from '@/core/ASide'
  import type { AllAppModule } from '@/core/type'
  import { ProjectSetup } from '@/components/LanguageProjects/setup'

  const props = defineProps<{
    typeFlag: AllAppModule
    showItem: boolean
  }>()

  const stopNav = () => {}

  const appStore = AppStore()
  const project = ProjectSetup(props.typeFlag)

  const services = computed(() => {
    return project.project.filter((p) => p.isService)
  })

  const serviceDo = (v: boolean) => {
    const all: Array<Promise<boolean | string>> = []
    if (props.showItem) {
      if (v) {
        const portNum: Set<number> = new Set<number>()
        services?.value?.forEach((v) => {
          if (!v?.state?.isRun) {
            if (!portNum.has(v.projectPort)) {
              portNum.add(v.projectPort)
              all.push(v.start(false))
            }
          }
        })
      } else {
        services?.value?.forEach((v) => {
          if (v.state?.isRun) {
            all.push(v.stop(false))
          }
        })
      }
    }
    return all
  }

  const serviceRunning = computed({
    get(): boolean {
      return services?.value?.length > 0 && services?.value?.some((v) => v.state.isRun)
    },
    set(v: boolean) {
      const all = serviceDo(v)
      Promise.all(all).then((res) => {
        const find = res.find((s) => typeof s === 'string')
        if (find) {
          MessageError(find)
        } else {
          MessageSuccess(I18nT('base.success'))
        }
      })
    }
  })

  const serviceDisabled = computed(() => {
    return (
      services?.value?.length === 0 ||
      services?.value?.some((v) => v.state.running) ||
      !appStore.versionInitiated
    )
  })

  const serviceFetching = computed(() => {
    return services?.value?.some((v) => v.state.running)
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    return serviceDo(!isRunning)
  }

  const switchChange = () => {
    serviceRunning.value = !serviceRunning.value
  }

  AppServiceModule[props.typeFlag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem: props.showItem
  } as any
</script>
