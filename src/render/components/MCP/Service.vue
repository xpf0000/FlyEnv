<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left flex items-center gap-3">
          <span>{{ I18nT('mcp.title') }}</span>
          <el-tag :type="MCPSetup.running ? 'success' : 'info'" effect="light" round>
            {{ MCPSetup.running ? I18nT('mcp.running') : I18nT('mcp.stopped') }}
          </el-tag>
        </div>
        <div class="right">
          <el-button
            v-if="!MCPSetup.running"
            type="primary"
            :loading="MCPSetup.starting"
            @click="MCPSetup.start()"
          >
            {{ I18nT('mcp.start') }}
          </el-button>
          <el-button v-else type="danger" :loading="MCPSetup.starting" @click="MCPSetup.stop()">
            {{ I18nT('mcp.stop') }}
          </el-button>
        </div>
      </div>
    </template>
    <div class="p-5">
      <p class="text-sm text-gray-500 mb-5">{{ I18nT('mcp.description') }}</p>
      <el-form label-position="top">
        <el-form-item :label="I18nT('mcp.host')">
          <el-input v-model="MCPSetup.config.host" :disabled="MCPSetup.running" @change="onSave" />
        </el-form-item>
        <el-form-item :label="I18nT('mcp.port')">
          <el-input-number
            v-model="MCPSetup.config.port"
            :min="1024"
            :max="65535"
            :disabled="MCPSetup.running"
            controls-position="right"
            @change="onSave"
          />
        </el-form-item>
        <el-form-item :label="I18nT('mcp.token')">
          <el-input v-model="MCPSetup.config.token" readonly>
            <template #append>
              <el-button @click="regenerate">{{ I18nT('mcp.regenerateToken') }}</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-checkbox
            v-model="MCPSetup.config.allowRemote"
            :disabled="MCPSetup.running"
            @change="onSave"
          >
            {{ I18nT('mcp.allowRemote') }}
          </el-checkbox>
          <p class="text-xs text-orange-500 mt-1">{{ I18nT('mcp.allowRemoteTip') }}</p>
        </el-form-item>
      </el-form>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { MCPSetup } from './setup'
  import { uuid } from '@/util/Index'

  const onSave = () => {
    MCPSetup.saveConfig({
      host: MCPSetup.config.host,
      port: MCPSetup.config.port,
      allowRemote: MCPSetup.config.allowRemote
    })
  }

  const regenerate = () => {
    const token = uuid(32)
    MCPSetup.config.token = token
    MCPSetup.saveConfig({ token })
  }
</script>
