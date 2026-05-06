<script setup lang="ts">
  import Store from './store'
  import { I18nT } from '@lang/index'
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.websocket-sse-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="main p-0">
          <el-card class="mb-3">
            <div class="grid grid-cols-1 xl:grid-cols-4 gap-3 items-end">
              <el-form-item label-position="top" label="Protocol:">
                <el-radio-group v-model="Store.protocol" @change="Store.onProtocolChange()">
                  <el-radio-button value="websocket">WebSocket</el-radio-button>
                  <el-radio-button value="sse">SSE</el-radio-button>
                </el-radio-group>
              </el-form-item>

              <el-form-item class="xl:col-span-2" label-position="top" label="URL:">
                <el-input
                  v-model.trim="Store.url"
                  :placeholder="
                    Store.protocol === 'websocket'
                      ? 'ws://localhost:3000/ws'
                      : 'http://localhost:3000/events'
                  "
                  @keyup.enter="Store.connect()"
                />
              </el-form-item>

              <div class="flex gap-2 mb-[18px]">
                <el-button v-if="!Store.isConnected" type="primary" @click="Store.connect()">
                  Connect
                </el-button>
                <el-button v-else type="danger" @click="Store.disconnect()">Disconnect</el-button>
                <el-tag
                  class="mt-1"
                  :type="
                    Store.status === 'Connected'
                      ? 'success'
                      : Store.status === 'Error'
                        ? 'danger'
                        : 'info'
                  "
                >
                  {{ Store.status }}
                </el-tag>
              </div>
            </div>
            <el-alert
              v-if="Store.protocol === 'websocket'"
              class="mt-2"
              title="Browser WebSocket connections do not support custom headers. Use query params, protocols, or cookies for authentication."
              type="info"
              show-icon
            />
            <el-alert v-if="Store.error" class="mt-2" :title="Store.error" type="error" show-icon />
          </el-card>

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <el-card header="Request Config">
              <el-tabs>
                <el-tab-pane label="Params">
                  <template v-for="item in Store.params" :key="item.id">
                    <div class="flex gap-2 mb-2">
                      <el-checkbox v-model="item.enabled" />
                      <el-input v-model="item.key" placeholder="Key" />
                      <el-input v-model="item.value" placeholder="Value" />
                      <el-button @click="Store.removeParam(item.id)">Delete</el-button>
                    </div>
                  </template>
                  <el-button @click="Store.addParam()">Add Param</el-button>
                </el-tab-pane>

                <el-tab-pane label="Headers">
                  <el-alert
                    v-if="Store.protocol === 'websocket'"
                    class="mb-3"
                    title="Headers are only used by SSE in this version. SSE connections run through the Node process to avoid browser CORS limits."
                    type="warning"
                    show-icon
                  />
                  <template v-for="item in Store.headers" :key="item.id">
                    <div class="flex gap-2 mb-2">
                      <el-checkbox v-model="item.enabled" />
                      <el-input v-model="item.key" placeholder="Header" />
                      <el-input v-model="item.value" placeholder="Value" show-password />
                      <el-button @click="Store.removeHeader(item.id)">Delete</el-button>
                    </div>
                  </template>
                  <el-button @click="Store.addHeader()">Add Header</el-button>
                </el-tab-pane>

                <el-tab-pane label="Auth">
                  <el-form-item label-position="top" label="Bearer Token:">
                    <el-input v-model="Store.bearerToken" type="textarea" :rows="4" show-password />
                  </el-form-item>
                  <el-button @click="Store.addAuthHeader()">Apply Authorization Header</el-button>
                </el-tab-pane>

                <el-tab-pane v-if="Store.protocol === 'websocket'" label="WS Options">
                  <el-form-item label-position="top" label="Subprotocols:">
                    <el-input v-model="Store.protocols" placeholder="graphql-transport-ws, chat" />
                  </el-form-item>
                  <el-form-item label-position="top" label="Heartbeat:">
                    <el-switch v-model="Store.heartbeatEnabled" />
                  </el-form-item>
                  <el-form-item label-position="top" label="Interval seconds:">
                    <el-input-number v-model="Store.heartbeatInterval" :min="1" :max="3600" />
                  </el-form-item>
                  <el-form-item label-position="top" label="Heartbeat message:">
                    <el-input v-model="Store.heartbeatMessage" type="textarea" :rows="4" />
                  </el-form-item>
                </el-tab-pane>

                <el-tab-pane v-if="Store.protocol === 'sse'" label="SSE Options">
                  <el-form-item label-position="top" label="Event filter:">
                    <el-input v-model="Store.sseEventFilter" placeholder="message" />
                  </el-form-item>
                  <el-form-item label-position="top" label="Last-Event-ID:">
                    <el-input v-model="Store.sseLastEventId" />
                  </el-form-item>
                </el-tab-pane>
              </el-tabs>
            </el-card>

            <el-card v-if="Store.protocol === 'websocket'" header="Send Message">
              <el-form-item label-position="top" label="Message type:">
                <el-radio-group v-model="Store.messageMode">
                  <el-radio-button value="json">JSON</el-radio-button>
                  <el-radio-button value="text">Text</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item label-position="top" label="Message:">
                <el-input v-model="Store.message" type="textarea" :rows="10" />
              </el-form-item>
              <div class="flex flex-wrap gap-2">
                <el-button type="primary" :disabled="!Store.canSend" @click="Store.sendMessage()">
                  Send
                </el-button>
                <el-button @click="Store.formatMessage()">Format JSON</el-button>
              </div>
            </el-card>

            <el-card v-else header="SSE Info">
              <el-alert
                title="SSE is a server-to-client stream. This mode only receives events and does not send messages."
                type="info"
                show-icon
              />
              <div class="mt-4 text-sm text-gray-500">
                <div>Supported fields: event, id, data, retry</div>
                <div class="mt-2">Connected duration: {{ Store.connectedDuration }}</div>
              </div>
            </el-card>
          </div>

          <el-card class="mt-3" header="Message Logs">
            <div class="flex justify-between mb-3">
              <div class="text-sm text-gray-500">
                {{ Store.logs.length }} entries · Duration: {{ Store.connectedDuration }}
              </div>
              <el-button @click="Store.clearLogs()">Clear</el-button>
            </div>

            <el-empty v-if="Store.logs.length === 0" description="No logs" />
            <div v-else class="flex flex-col gap-2">
              <template v-for="item in Store.logs" :key="item.id">
                <div class="rounded border border-gray-200 dark:border-gray-700 p-3">
                  <div class="flex flex-wrap items-center gap-2 mb-2">
                    <el-tag
                      size="small"
                      :type="
                        item.type === 'error'
                          ? 'danger'
                          : item.type === 'received' || item.type === 'event'
                            ? 'success'
                            : item.type === 'sent'
                              ? 'primary'
                              : 'info'
                      "
                    >
                      {{ item.type }}
                    </el-tag>
                    <span class="font-medium">{{ item.label }}</span>
                    <span class="text-xs text-gray-500">{{ item.time }}</span>
                    <span class="text-xs text-gray-500">{{ item.size }} B</span>
                  </div>
                  <pre
                    v-if="item.content"
                    class="whitespace-pre-wrap break-all text-xs leading-5"
                    >{{ item.content }}</pre
                  >
                </div>
              </template>
            </div>
          </el-card>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
