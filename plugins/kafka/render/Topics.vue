<template>
  <div class="module-config">
    <el-card>
      <template #header>
        <div class="flex items-center justify-between">
          <span>{{ KafkaT('topics') }}</span>
          <div class="flex items-center gap-2">
            <el-button :disabled="!canOperate" :loading="fetching" @click="fetchTopics">
              {{ I18nT('common.action.refresh') }}
            </el-button>
            <el-button type="primary" :disabled="!canOperate || fetching" @click="openCreate">
              {{ I18nT('common.action.add') }}
            </el-button>
          </div>
        </div>
      </template>
      <el-empty v-if="!currentVersion" :description="KafkaT('selectKafkaVersionFirst')" />
      <el-empty v-else-if="!javaHome" :description="KafkaT('bindJavaFirst')" />
      <el-table v-else v-loading="fetching" :data="topics" style="width: 100%">
        <el-table-column prop="name" :label="I18nT('common.label.name')" />
        <el-table-column :label="I18nT('common.label.action')" width="120" align="center">
          <template #default="{ row }">
            <el-button link type="danger" :disabled="fetching" @click="removeTopic(row.name)">
              {{ I18nT('common.action.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    <el-dialog v-model="createVisible" :title="KafkaT('createTopic')" width="420px" append-to-body>
      <el-form label-width="90px">
        <el-form-item :label="I18nT('common.label.name')">
          <el-input v-model.trim="createForm.name" placeholder="my-topic" />
        </el-form-item>
        <el-form-item :label="KafkaT('partitions')">
          <el-input-number v-model="createForm.partitions" :min="1" :max="100" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="createTopic">
          {{ I18nT('base.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref, watch } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { BrewStore } from '@/store/brew'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { KafkaManager } from './store'
  import { KafkaT } from './lang'

  type TopicItem = {
    name: string
  }

  const brewStore = BrewStore()
  const currentVersion = computed(() => brewStore.currentVersion('kafka'))

  const topics = ref<TopicItem[]>([])
  const fetching = ref(false)
  const creating = ref(false)
  const createVisible = ref(false)
  const createForm = reactive({
    name: '',
    partitions: 1
  })

  KafkaManager.init().catch()

  const javaHome = computed(() => {
    const bin = currentVersion.value?.bin
    return bin ? KafkaManager.getBinding(bin)?.javaHome : undefined
  })

  const canOperate = computed(() => !!currentVersion.value?.version && !!javaHome.value)

  const invoke = (...args: any[]) =>
    new Promise<any>((resolve, reject) => {
      IPC.send('app-fork:kafka', ...args).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          resolve(res?.data)
        } else {
          reject(new Error(res?.msg ?? I18nT('base.fail')))
        }
      })
    })

  const fetchTopics = async () => {
    if (fetching.value) return
    const version = currentVersion.value
    if (!version?.version || !javaHome.value) return
    fetching.value = true
    try {
      const list = await invoke('fetchTopics', JSON.parse(JSON.stringify(version)), javaHome.value)
      topics.value = (Array.isArray(list) ? list : [])
        .map((name) => `${name}`.trim())
        .filter(Boolean)
        .map((name) => ({ name }))
    } catch (error: any) {
      MessageError(`${error?.message ?? error}`)
    } finally {
      fetching.value = false
    }
  }

  const openCreate = () => {
    createForm.name = ''
    createForm.partitions = 1
    createVisible.value = true
  }

  const createTopic = async () => {
    if (creating.value) return
    const name = createForm.name.trim()
    if (!name) {
      MessageError(KafkaT('topicNameRequired'))
      return
    }
    const version = currentVersion.value
    if (!version?.version || !javaHome.value) return
    creating.value = true
    try {
      await invoke(
        'createTopic',
        JSON.parse(JSON.stringify(version)),
        javaHome.value,
        name,
        createForm.partitions
      )
      MessageSuccess(I18nT('base.success'))
      createVisible.value = false
      await fetchTopics()
    } catch (error: any) {
      MessageError(`${error?.message ?? error}`)
    } finally {
      creating.value = false
    }
  }

  const removeTopic = (name: string) => {
    if (fetching.value) return
    ElMessageBox.confirm(I18nT('base.delAlertContent'), I18nT('base.delAlertTitle'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(async () => {
        const version = currentVersion.value
        if (!version?.version || !javaHome.value) return
        fetching.value = true
        try {
          await invoke('deleteTopic', JSON.parse(JSON.stringify(version)), javaHome.value, name)
          MessageSuccess(I18nT('base.success'))
          await fetchTopics()
        } catch (error: any) {
          MessageError(`${error?.message ?? error}`)
        } finally {
          fetching.value = false
        }
      })
      .catch(() => {})
  }

  watch(
    [currentVersion, javaHome],
    () => {
      topics.value = []
      if (canOperate.value) {
        fetchTopics().catch()
      }
    },
    { immediate: true }
  )
</script>
