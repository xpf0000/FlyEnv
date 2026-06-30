<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left flex items-center">
          <span>{{ I18nT('kimi.mcp') }}</span>
          <el-tooltip :content="I18nT('common.mcp.addServer')" placement="top" :show-after="300">
            <el-button link class="ml-3" :icon="Plus" @click="openAdd" />
          </el-tooltip>
        </div>
        <el-button link :disabled="KimiSetup.mcpLoading" @click="KimiSetup.refreshMcp()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': KimiSetup.mcpLoading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <div v-loading="KimiSetup.mcpLoading" class="p-5 h-full overflow-hidden flex flex-col">
        <el-scrollbar v-if="KimiSetup.mcpServers.length > 0">
          <el-table :data="KimiSetup.mcpServers" style="width: 100%">
            <el-table-column prop="name" :label="I18nT('common.mcp.name')" width="180" />
            <el-table-column prop="type" :label="I18nT('common.mcp.type')" width="100" />
            <el-table-column
              prop="commandOrUrl"
              :label="I18nT('common.mcp.commandOrUrl')"
              show-overflow-tooltip
            />
            <el-table-column prop="scope" :label="I18nT('common.mcp.scope')" width="100" />
            <el-table-column :label="I18nT('base.action')" width="100" align="center">
              <template #default="{ row }">
                <el-button link type="danger" @click="confirmRemove(row.name)">{{
                  I18nT('base.del')
                }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-scrollbar>
        <el-empty v-else-if="!KimiSetup.mcpLoading" />
      </div>
    </div>

    <el-dialog v-model="addVisible" :title="I18nT('common.mcp.addServer')" width="500" append-to-body>
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="I18nT('common.mcp.name')">
          <el-input v-model="form.name" placeholder="my-server" />
        </el-form-item>
        <el-form-item :label="I18nT('common.mcp.type')">
          <el-radio-group v-model="form.type">
            <el-radio-button value="http">http</el-radio-button>
            <el-radio-button value="sse">sse</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="I18nT('common.mcp.commandOrUrl')">
          <el-input v-model="form.commandOrUrl" placeholder="https://example.com/mcp" />
        </el-form-item>
        <el-form-item :label="I18nT('mcp.token')">
          <el-input v-model="form.token" placeholder="Bearer token" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :disabled="!canSubmit" @click="submitAdd">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { Plus } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@lang/index'
  import { KimiSetup } from './setup'

  const addVisible = ref(false)
  const form = reactive({
    name: '',
    type: 'http',
    commandOrUrl: '',
    token: ''
  })

  const canSubmit = computed(() => form.name.trim() && form.commandOrUrl.trim())

  const openAdd = () => {
    form.name = ''
    form.type = 'http'
    form.commandOrUrl = ''
    form.token = ''
    addVisible.value = true
  }

  const submitAdd = async () => {
    const ok = await KimiSetup.addMcp(
      form.name.trim(),
      form.type,
      form.commandOrUrl.trim(),
      form.token.trim()
    )
    if (ok) {
      addVisible.value = false
    }
  }

  const confirmRemove = (name: string) => {
    ElMessageBox.confirm(I18nT('base.delAlertContent'), I18nT('base.delAlertTitle'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        KimiSetup.removeMcp(name)
      })
      .catch(() => {})
  }

  onMounted(() => {
    KimiSetup.refreshMcp()
  })
</script>
