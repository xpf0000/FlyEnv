<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left flex items-center">
          <span>{{ I18nT('claudeCode.mcp') }}</span>
          <el-tooltip :content="I18nT('claudeCode.addServer')" placement="top" :show-after="300">
            <el-button link class="ml-3" :icon="Plus" @click="openAdd" />
          </el-tooltip>
        </div>
        <el-button
          link
          :disabled="ClaudeCodeSetup.mcpLoading"
          @click="ClaudeCodeSetup.refreshMcp()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': ClaudeCodeSetup.mcpLoading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <div v-loading="ClaudeCodeSetup.mcpLoading" class="p-5 h-full overflow-hidden flex flex-col">
        <el-scrollbar v-if="ClaudeCodeSetup.mcpServers.length > 0">
          <el-table :data="ClaudeCodeSetup.mcpServers" style="width: 100%">
            <el-table-column prop="name" :label="I18nT('claudeCode.mcpName')" width="180" />
            <el-table-column prop="type" :label="I18nT('claudeCode.mcpType')" width="100" />
            <el-table-column
              prop="commandOrUrl"
              :label="I18nT('claudeCode.mcpCommandOrUrl')"
              show-overflow-tooltip
            />
            <el-table-column prop="scope" :label="I18nT('claudeCode.mcpScope')" width="100" />
            <el-table-column :label="I18nT('base.action')" width="100" align="center">
              <template #default="{ row }">
                <el-button link type="danger" @click="confirmRemove(row.name)">{{
                  I18nT('base.del')
                }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-scrollbar>
        <el-empty v-else-if="!ClaudeCodeSetup.mcpLoading" />
      </div>
    </div>

    <el-dialog
      v-model="addVisible"
      :title="I18nT('claudeCode.addServer')"
      width="500"
      append-to-body
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="I18nT('claudeCode.mcpName')">
          <el-input v-model="form.name" placeholder="my-server" />
        </el-form-item>
        <el-form-item :label="I18nT('claudeCode.mcpType')">
          <el-radio-group v-model="form.type">
            <el-radio-button value="stdio">stdio</el-radio-button>
            <el-radio-button value="http">http</el-radio-button>
            <el-radio-button value="sse">sse</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="I18nT('claudeCode.mcpCommandOrUrl')">
          <el-input
            v-model="form.commandOrUrl"
            :placeholder="form.type === 'stdio' ? 'npx my-mcp-server' : 'https://example.com/mcp'"
          />
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
  import { ref, reactive, computed, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { ClaudeCodeSetup } from './setup'
  import { ElMessageBox } from 'element-plus'
  import { Plus } from '@element-plus/icons-vue'

  const addVisible = ref(false)
  const form = reactive({
    name: '',
    type: 'stdio',
    commandOrUrl: ''
  })

  const canSubmit = computed(() => form.name.trim() && form.commandOrUrl.trim())

  const openAdd = () => {
    form.name = ''
    form.type = 'stdio'
    form.commandOrUrl = ''
    addVisible.value = true
  }

  const submitAdd = async () => {
    const ok = await ClaudeCodeSetup.addMcp(form.name.trim(), form.type, form.commandOrUrl.trim())
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
        ClaudeCodeSetup.removeMcp(name)
      })
      .catch(() => {})
  }

  onMounted(() => {
    ClaudeCodeSetup.refreshMcp()
  })
</script>
