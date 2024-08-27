<template>
    <el-popover placement="left" width="auto" trigger="hover" popper-class="host-sort-poper" :show-arrow="false"
        :visible="show" @show="onShow" @hide="onHide">
        <template #reference>
            <div class="abc-eeadb" :style="style"></div>
        </template>
        <template #default>
            <div v-poper-fix v-click-outside="onClickOut" class="host-sort">
                <div class="top">
                    <span>置顶</span>
                    <el-switch v-model="isTop" :disabled="!editHost"></el-switch>
                </div>
                <template v-if="disabled">
                    <el-slider :show-tooltip="false" :max="1" :disabled="true" vertical height="200px" />
                </template>
                <template v-else>
                    <el-slider v-model="value" :debounce="350" :show-tooltip="false" :max="max" :disabled="!editHost"
                        vertical height="200px" />
                </template>
            </div>
        </template>
    </el-popover>
</template>
<script lang="ts" setup>
import { computed, nextTick, type Ref, ref } from 'vue'
import { type AppHost, AppStore } from '@/store/app'
import { AsyncComponentSetup } from '@/util/AsyncComponent'
import { ClickOutside as vClickOutside } from 'element-plus'

const { join } = require('path')
const { writeFile } = require('fs-extra')

const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

const props = defineProps<{
    hostId: number
    rect: DOMRect
}>()

const style = {
    position: 'fixed',
    left: `${props.rect.left}px`,
    top: `${props.rect.top}px`,
    width: `${props.rect.width}px`,
    height: `${props.rect.height}px`,
    opacity: 0
}
const appStore = AppStore()

let hostBack = JSON.stringify(appStore.hosts)

let editHost: Ref<AppHost | undefined> = ref()
editHost.value = appStore.hosts.find((h) => h?.id === props?.hostId)

show.value = true

let isShow = false

const onShow = () => {
    isShow = true
}

const doSave = (host: string) => {
    const hostfile = join(global.Server.BaseDir!, 'host.json')
    writeFile(hostfile, host).then()
}

const onHide = () => {
    delete editHost.value?.isSorting
    closedFn && closedFn()
    const host = JSON.stringify(appStore.hosts)
    if (hostBack !== host) {
        console.log('has changed !!!')
        doSave(host)
    }
}

const onClickOut = () => {
    console.log('onClickOut !!!', show.value, isShow)
    if (isShow) {
        show.value = false
    }
}

const flowScroll = () => {
    nextTick().then(() => {
        let dom: HTMLElement | null | undefined = document.querySelector(
            `[data-host-id="${props.hostId}"]`
        ) as any
        if (dom) {
            dom = dom?.parentElement?.parentElement?.parentElement
            dom?.scrollIntoView({
                block: 'center',
                behavior: 'smooth'
            })
        }
    })
}

const isTop = computed({
    get() {
        return editHost?.value?.isTop ?? false
    },
    set(v: boolean) {
        if (!editHost?.value) {
            return
        }
        editHost.value!.isSorting = true
        const host: any = editHost.value
        host.isTop = v
        if (v) {
            const index = appStore.hosts.findIndex((h) => h === host)
            if (index >= 0) {
                appStore.hosts.splice(index, 1)
                appStore.hosts.unshift(host)
            }
        } else {
            const index = appStore.hosts.findIndex((h) => h === host)
            if (index >= 0) {
                appStore.hosts.splice(index, 1)
                const list = appStore.hosts.filter((h) => !!h?.isTop)
                appStore.hosts.splice(list.length, 0, host)
            }
        }
        flowScroll()
    }
})

const max = computed(() => {
    if (isTop.value) {
        const list = appStore.hosts.filter((h) => !!h?.isTop)
        return Math.max(0, list.length - 1)
    }
    const list = appStore.hosts.filter((h) => !h?.isTop)
    return Math.max(0, list.length - 1)
})

const value = computed({
    get() {
        if (!editHost?.value) {
            return 0
        }
        let list = appStore.hosts.filter((h) => !h?.isTop)
        if (isTop.value) {
            list = appStore.hosts.filter((h) => !!h?.isTop)
        }
        return list.length - 1 - list.findIndex((h) => h === editHost?.value)
    },
    set(v: number) {
        if (!editHost?.value) {
            return
        }
        editHost.value!.isSorting = true
        const host: any = editHost.value
        let index = v
        if (isTop.value) {
            const list = appStore.hosts.filter((h) => !!h?.isTop)
            index = list.length - 1 - v
        } else {
            const list = appStore.hosts.filter((h) => !h?.isTop)
            index = list.length - 1 - v
        }
        const list = appStore.hosts.filter((h) => !!h?.isTop)
        const rawIndex = appStore.hosts.findIndex((h) => h === host)
        if (rawIndex >= 0) {
            appStore.hosts.splice(rawIndex, 1)
            if (!isTop.value) {
                index += list.length
            }
            appStore.hosts.splice(index, 0, host)
        }
        flowScroll()
    }
})

const disabled = computed(() => {
    return !editHost?.value || max.value === 0 || max.value < value?.value
})

defineExpose({
    show,
    onSubmit,
    onClosed,
    closedFn
})
</script>