<template>
  <el-dialog
    v-model="show"
    :title="'Cloudflare Tunnel' + ' ' + I18nT('base.add')"
    class="el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    width="600px"
    @closed="closedFn"
  >
    <el-scrollbar class="px-2">
      <el-form ref="formRef" :model="form" label-position="top" class="pt-2" @submit.prevent>
        <el-form-item prop="apiToken" label="Cloudflare ApiToken" required :show-message="false">
          <el-input v-model="form.apiToken"> </el-input>
        </el-form-item>

        <el-form-item label="Zones">
          <el-select v-model="form.zoneId" filterable>
            <template v-for="(item, _index) in zones" :key="_index">
              <el-option :label="item.name" :value="item.id"></el-option>
            </template>
          </el-select>
        </el-form-item>

        <el-form-item label="Cloudflare Zone ID" required :show-message="false">
          <el-input v-model="form.zoneId"> </el-input>
        </el-form-item>

        <el-form-item label="Cloudflare Account ID" required :show-message="false">
          <el-input v-model="form.accountId"> </el-input>
        </el-form-item>

        <el-form-item :label="I18nT('host.OnlineDomain')" required :show-message="false">
          <div class="w-full flex items-center overflow-hidden">
            <el-input v-model="form.subdomain" class="flex-1"> </el-input>
            <div class="px-2 flex-shrink-0 flex items-center">.</div>
            <el-input v-model="form.zoneName" class="flex-[3]"> </el-input>
          </div>
        </el-form-item>

        <el-form-item :label="I18nT('host.LocalDoman')" required :show-message="false">
          <el-autocomplete v-model="form.localService" :fetch-suggestions="querySearch" clearable />
        </el-form-item>
      </el-form>
    </el-scrollbar>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click.stop="onCancel">{{ I18nT('base.cancel') }}</el-button>
        <el-button :disabled="!saveEnable" type="primary" @click.stop="doSubmit">{{
          I18nT('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'

  import type { ZoneType } from '@/core/CloudflareTunnel/type'
  import IPC from '@/util/IPC'
  import { ZoneDict } from '@/components/CloudflareTunnel/setup'
  import { AppStore } from '@/store/app'
  import { CloudflareTunnel } from '@/core/CloudflareTunnel/CloudflareTunnel'
  import { reactiveBind, uuid } from '@/util/Index'
  import CloudflareTunnelStore from '@/core/CloudflareTunnel/CloudflareTunnelStore'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const formRef = ref()

  const zones = ref<ZoneType[]>([])

  const form = ref({
    apiToken: '',
    accountId: '',
    subdomain: '',
    localService: '',

    zoneId: '',
    zoneName: ''
  })

  const saveEnable = computed(() => {
    return (
      form.value.apiToken &&
      form.value.accountId &&
      form.value.subdomain &&
      form.value.localService &&
      form.value.zoneId &&
      form.value.zoneName
    )
  })

  watch(
    () => form.value.apiToken,
    (v) => {
      zones.value = []

      if (v) {
        if (ZoneDict?.[v]) {
          zones.value = ZoneDict[v]
          return
        }
        if (v.length < 24) {
          return
        }
        IPC.send('app-fork:cloudflare-tunnel', 'fetchAllZone', {
          apiToken: v
        }).then((key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            zones.value = reactive(res?.data ?? [])
            ZoneDict[v] = zones.value
          }
        })
      }
    }
  )

  watch(
    () => form.value.zoneId,
    (v) => {
      if (v) {
        const find = zones.value.find((zone) => zone.id === v)
        if (find) {
          form.value.zoneName = find.name
          form.value.accountId = find.account.id
        }
      }
    }
  )

  const appStore = AppStore()
  const localHosts = computed(() => {
    const all: Set<string> = new Set()
    appStore.hosts.forEach((host) => {
      all.add(host.name)
      const alias = host.alias.split('\n').filter((n) => {
        return n && n.trim().length > 0
      })
      for (const a of alias) {
        all.add(a)
      }
    })
    return Array.from(all)
  })

  const querySearch = (queryString: string, cb: any) => {
    if (queryString.trim()) {
      const search = queryString.trim().toLowerCase()
      cb(localHosts.value.filter((host) => host.includes(search)).map((host) => ({ value: host })))
    } else {
      cb(localHosts.value.map((host) => ({ value: host })))
    }
  }

  const onCancel = () => {
    show.value = false
  }

  const doSubmit = async () => {
    const item = reactiveBind(new CloudflareTunnel(form.value))
    item.id = uuid()
    CloudflareTunnelStore.items.unshift(item)
    CloudflareTunnelStore.save()
    onCancel()
  }

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
