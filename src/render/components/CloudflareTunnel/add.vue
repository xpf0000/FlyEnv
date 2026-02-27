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
            <span class="p-[2px] flex-shrink-0">.</span>
            <el-input v-model="form.zoneName" class="flex-[3]"> </el-input>
          </div>
        </el-form-item>

        <el-form-item :label="I18nT('host.LocalDoman')" required :show-message="false">
          <el-input v-model="form.localService"> </el-input>
        </el-form-item>
      </el-form>
    </el-scrollbar>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click.stop="onCancel">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click.stop="doSubmit">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'

  import type { ZoneType } from '@/core/CloudflareTunnel/type'

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

  const onCancel = () => {
    show.value = false
  }

  const doSubmit = async () => {
    onCancel()
  }

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
