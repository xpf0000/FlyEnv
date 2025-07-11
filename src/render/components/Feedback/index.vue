<template>
  <el-dialog
    v-model="show"
    :title="$t('feedback.sendMessage')"
    width="600px"
    :destroy-on-close="true"
    class="host-link-dialog"
    @closed="closedFn"
  >
    <el-form v-model="FeedbackStore" label-position="top" @submit.prevent>
      <el-form-item :label="I18nT('feedback.email')">
        <el-input v-model="FeedbackStore.email" type="text" clearable></el-input>
      </el-form-item>
      <el-form-item :label="I18nT('feedback.country')">
        <el-select
          v-model="FeedbackStore.country"
          style="width: 100%"
          filterable
          clearable
          :placeholder="I18nT('feedback.inputFilter')"
        >
          <el-option :label="I18nT('feedback.noSelected')" value=""></el-option>
          <template v-for="(item, _index) in Country" :key="_index">
            <el-option :label="item.name" :value="item.name"></el-option>
          </template>
        </el-select>
      </el-form-item>
      <el-form-item :label="I18nT('feedback.message')">
        <el-input
          v-model="FeedbackStore.message"
          type="textarea"
          :minlength="5"
          :maxlength="1024"
          :rows="6"
        ></el-input>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <template v-if="FeedbackStore.time === 0">
          <el-button
            type="primary"
            :disabled="FeedbackStore.loading"
            :loading="FeedbackStore.loading"
            @click="doSubmit"
            >{{ I18nT('base.confirm') }}</el-button
          >
        </template>
        <template v-else>
          <el-button type="primary" disabled>{{ FeedbackStore.time }}s</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import Country from './country.json'
  import { FeedbackStore } from '@/components/Feedback/store'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const doSubmit = () => {
    FeedbackStore.send().then(() => {
      show.value = false
    })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
