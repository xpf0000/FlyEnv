<template>
  <div class="memory-connect page-scroll">
    <section class="connect-page" aria-labelledby="memory-connect-title">
      <div class="page-heading">
        <div
          ><span class="eyebrow">CONNECT YOUR AGENT</span
          ><h1 id="memory-connect-title">{{ T('connectHeading') }}</h1
          ><p>{{ T('connectSubheading') }}</p></div
        >
        <div class="local-status"
          ><i aria-hidden="true"></i
          ><span>{{
            T(connect.serviceReady ? 'connectServiceReady' : 'connectServiceWaiting')
          }}</span></div
        >
      </div>
      <section
        class="connection-panel"
        :class="{ configured: complete, connecting: operation?.status === 'running' }"
        :aria-label="T('connectAgent')"
      >
        <div class="connection-form">
          <fieldset :disabled="connect.busy">
            <legend>{{ T('connectChooseAgent') }}</legend>
            <div class="client-options">
              <label
                v-for="item in clients"
                :key="item.id"
                class="client-option"
                :class="{ 'generic-option': item.id === 'generic' }"
              >
                <input
                  v-model="client"
                  type="radio"
                  name="memory-connect-client"
                  :value="item.id"
                />
                <span class="client-logo" aria-hidden="true" v-html="item.logo" />
                <span class="client-copy"
                  ><strong>{{ item.id === 'generic' ? T('connectOtherClient') : item.name }}</strong
                  ><small>{{
                    T(item.id === 'generic' ? 'connectGenericHint' : 'connectAutomaticHint')
                  }}</small></span
                ><span class="selection-dot" aria-hidden="true" />
              </label>
            </div>
            <div class="global-scope"
              ><ShieldIcon /><div
                ><strong>{{ T('connectGlobal') }}</strong
                ><p>{{ T('connectGlobalHelp') }}</p></div
              ></div
            >
          </fieldset>
          <div v-if="!generic" class="connect-action">
            <button
              class="primary-button"
              :class="{ complete }"
              type="button"
              :disabled="connect.busy || (complete && connect.serviceReady)"
              @click="run"
            >
              <span class="button-symbol" aria-hidden="true">{{ complete ? '✓' : '↗' }}</span
              ><span class="button-label">{{ buttonLabel }}</span
              ><span v-if="!complete" aria-hidden="true">→</span>
            </button>
            <p class="action-help">{{
              T(
                complete
                  ? 'connectNewSession'
                  : generic
                    ? 'connectGenericActionHelp'
                    : 'connectOnce'
              )
            }}</p>
          </div>
        </div>
        <div class="connection-preview">
          <template v-if="!generic">
            <div class="automatic-content">
              <div class="preview-caption"
                ><span>LOCAL MEMORY CONNECTION</span
                ><span class="state-pill">{{
                  T(
                    operation?.status === 'running'
                      ? 'connectRunning'
                      : complete
                        ? 'connectConfigured'
                        : operation?.status === 'partial'
                          ? 'connectPartialLabel'
                          : 'connectWaiting'
                  )
                }}</span></div
              >
              <div class="connection-diagram" aria-hidden="true">
                <div class="diagram-node memory-node"
                  ><div class="memory-orbit"><i /><span>M</span></div
                  ><strong>AI Memory</strong><small>{{ T('connectAcrossProjects') }}</small></div
                >
                <div class="connection-wire"
                  ><i class="signal signal-one" /><i class="signal signal-two" /><small>{{
                    T(complete ? 'connectWireDone' : 'connectWire')
                  }}</small></div
                >
                <div class="diagram-node agent-node"
                  ><div class="diagram-agent-logo" v-html="selectedClient.logo" /><strong>{{
                    selectedClient.name
                  }}</strong
                  ><small>{{ T('connectYourAgent') }}</small></div
                >
              </div>
              <div class="automation-heading"
                ><h2>{{ T(complete ? 'connectComplete' : 'connectAutomatic') }}</h2
                ><span>{{ completedSteps }} / 3</span></div
              >
              <ol class="automation-list">
                <li
                  v-for="(title, index) in stepTitles"
                  :key="index"
                  :class="operation?.steps[index]"
                  :title="index === 2 ? operation?.rulesPath : undefined"
                  ><span class="step-mark" aria-hidden="true">{{
                    operation?.steps[index] === 'done'
                      ? '✓'
                      : operation?.steps[index] === 'failed' ||
                          operation?.steps[index] === 'unknown'
                        ? '!'
                        : ''
                  }}</span
                  ><span>{{ title }}</span
                  ><small>{{ T(stepLabel(operation?.steps[index])) }}</small></li
                >
              </ol>
              <div class="completion-note" role="status" aria-live="polite"
                ><span aria-hidden="true">✧</span
                ><p>{{
                  T(
                    operation?.status === 'partial'
                      ? 'connectPartial'
                      : complete
                        ? 'connectNotVerified'
                        : operation?.status === 'failed'
                          ? 'connectFailed'
                          : 'connectPreserve'
                  )
                }}</p></div
              >
              <p v-if="operation?.errorCode" class="connection-error" role="alert">{{
                T(operation.errorCode)
              }}</p>
              <p v-if="operation?.rulesPath" class="installed-path">{{ operation.rulesPath }}</p>
            </div>
          </template>
          <section v-else class="generic-content" :aria-label="T('connectGeneric')">
            <div class="preview-caption"
              ><span>MANUAL CONNECTION</span
              ><span class="state-pill">{{ T('connectOtherMcp') }}</span></div
            >
            <h2 class="generic-title">{{ T('connectGenericHeading') }}</h2>
            <div class="manual-section">
              <div class="manual-heading"
                ><h3><span>01</span>{{ T('connectAddMcp') }}</h3
                ><div class="transport-tabs" role="group" :aria-label="T('connectTransport')"
                  ><button
                    v-for="mode in ['http', 'stdio'] as const"
                    :key="mode"
                    type="button"
                    :aria-pressed="transport === mode"
                    :disabled="connect.busy"
                    @click="transport = mode"
                    >{{ mode === 'http' ? 'HTTP' : 'stdio' }}</button
                  ></div
                ></div
              >
              <p>{{ T(transport === 'http' ? 'connectHttpHelp' : 'connectStdioHelp') }}</p>
              <div class="snippet-heading"
                ><span>{{ transport === 'http' ? 'Streamable HTTP · JSON' : 'stdio · JSON' }}</span
                ><button
                  type="button"
                  :disabled="!connect.snippets[transport]"
                  @click="connect.copyConfig(transport)"
                  >{{ T('connectCopyConfig') }}</button
                ></div
              >
              <pre class="generic-snippet" tabindex="0" :aria-label="T('connectGeneric')">{{
                connect.snippets[transport] ||
                T(
                  connect.snippetBusy
                    ? 'connectLoadingConfig'
                    : (connect.snippetErrors[transport] ?? 'config_unavailable')
                )
              }}</pre>
              <p class="manual-hint">{{ T('connectKeepRunning') }}</p>
              <p
                v-if="connect.feedback[`config:${transport}`]"
                class="copy-feedback"
                role="status"
                >{{ T(connect.feedback[`config:${transport}`]) }}</p
              >
            </div>
            <div class="manual-section rules-section"
              ><div class="manual-heading"
                ><h3><span>02</span>{{ T('connectAddRules') }}</h3
                ><button class="text-button" type="button" @click="connect.copyRules()">{{
                  T('copyRules')
                }}</button></div
              ><p>{{ T('connectGenericRulesHelp') }}</p
              ><p v-if="connect.feedback.rules" class="copy-feedback" role="status">{{
                T(connect.feedback.rules)
              }}</p></div
            >
            <div class="manual-footer"
              ><span aria-hidden="true">✧</span><span>{{ T('connectGenericFooter') }}</span></div
            >
            <p v-if="operation?.status === 'failed'" class="connection-error" role="alert">{{
              T(operation.errorCode ?? 'connectFailed')
            }}</p>
          </section>
        </div>
      </section>
      <div class="page-bottom">
        <span class="storage-note"><ShieldIcon />{{ T('connectStorage') }}</span>
        <details
          ><summary>{{ T('connectAdvanced') }}<span aria-hidden="true">⌄</span></summary
          ><div class="advanced-content">
            <h3
              >{{ T('connectProjectRules') }} <span>{{ T('connectOptional') }}</span></h3
            ><p>{{ T('connectProjectHelp') }}</p>
            <label class="project-label" for="memory-connect-project">{{
              T('connectChooseProject')
            }}</label>
            <div class="project-control"
              ><select id="memory-connect-project" v-model="projectPath"
                ><option value="">{{ T('connectChooseProject') }}</option
                ><option
                  v-for="project in projects"
                  :key="project.projectId"
                  :value="project.project_path"
                  >{{ project.name }}</option
                ><option
                  v-if="projectPath && !projects.some((item) => item.project_path === projectPath)"
                  :value="projectPath"
                  >{{ projectPath }}</option
                ></select
              ></div
            >
            <button class="text-button directory-button" type="button" @click="chooseProject">{{
              T('chooseDirectory')
            }}</button
            ><p v-if="projectPath" class="project-path">{{ projectPath }}</p>
            <button
              class="project-rules-button"
              type="button"
              :disabled="!projectPath || connect.busy || projectOperation?.status === 'running'"
              @click="installProject"
              >{{
                T(
                  generic
                    ? 'copyRules'
                    : projectOperation?.status === 'running'
                      ? 'connectRunning'
                      : 'connectInstallProject'
                )
              }}</button
            >
            <p v-if="projectOperation" class="project-rules-status" role="status">{{
              T(
                projectOperation.status === 'complete'
                  ? 'connectProjectDone'
                  : projectOperation.status === 'failed'
                    ? (projectOperation.errorCode ?? 'rules_unavailable')
                    : 'connectRunning'
              )
            }}</p>
            <p v-if="projectOperation?.path" class="project-path">{{ projectOperation.path }}</p>
            <p v-if="generic && connect.feedback.rules" class="copy-feedback" role="status">{{
              T(connect.feedback.rules)
            }}</p>
          </div></details
        >
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
  import { computed, defineComponent, h, onMounted, ref, watch } from 'vue'
  import codexLogo from '@/svg/codex.svg?raw'
  import claudeLogo from '@/svg/claude-code.svg?raw'
  import antigravityLogo from '@/svg/antigravity.svg?raw'
  import githubLogo from '@/svg/github.svg?raw'
  import openCodeLogo from '@/svg/opencode.svg?raw'
  import kimiLogo from '@/svg/kimi.svg?raw'
  import { memoryConnectionClient } from './navigation'
  import { MemoryConnectManager as connect } from './connect-manager'
  import { MemoryManager as memory } from './manager'
  import { MemoryT as T } from './lang'
  import type { ConnectClient, ConnectStep, ConnectTransport } from './connect-controller'
  const genericLogo =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/></svg>'
  const clients: { id: ConnectClient; name: string; logo: string }[] = [
    { id: 'claudeCode', name: 'Claude Code', logo: claudeLogo },
    { id: 'antigravity', name: 'Antigravity CLI', logo: antigravityLogo },
    { id: 'codex', name: 'Codex', logo: codexLogo },
    { id: 'copilotCli', name: 'GitHub Copilot CLI', logo: githubLogo },
    { id: 'openCode', name: 'OpenCode', logo: openCodeLogo },
    { id: 'kimi', name: 'Kimi', logo: kimiLogo },
    { id: 'generic', name: T('connectGeneric'), logo: genericLogo }
  ]
  const ShieldIcon = defineComponent(
    () => () =>
      h(
        'svg',
        {
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.5',
          'aria-hidden': true
        },
        [h('path', { d: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z' }), h('path', { d: 'm8 12 3 3 5-6' })]
      )
  )
  const client = memoryConnectionClient()
  const transport = ref<ConnectTransport>('http')
  const projectPath = ref('')
  const projects = computed(() => memory.projectsResult?.data ?? [])
  const generic = computed(() => client.value === 'generic')
  const operation = computed(() => connect.operations[client.value])
  const complete = computed(() => !generic.value && operation.value?.status === 'complete')
  const selectedClient = computed(() => clients.find((item) => item.id === client.value)!)
  const completedSteps = computed(
    () => operation.value?.steps.filter((step) => step === 'done').length ?? 0
  )
  const projectOperation = computed(
    () => connect.projectOperations[`${client.value}:${projectPath.value}`]
  )
  const stepTitles = computed(() => [
    T('connectPrepareService'),
    `${T('connectConfigureClient')} ${selectedClient.value.name}`,
    T('connectGlobalRules')
  ])
  const buttonLabel = computed(() =>
    connect.busy
      ? T('connectRunning')
      : complete.value && connect.serviceReady
        ? `${selectedClient.value.name} · ${T('connectConfigured')}`
        : operation.value?.status === 'partial' || operation.value?.status === 'failed'
          ? T('connectRetry')
          : `${T('connectOneClick')} ${selectedClient.value.name}`
  )
  const stepLabel = (step?: ConnectStep) =>
    step === 'done'
      ? 'connectStepDone'
      : step === 'running'
        ? 'connectStepRunning'
        : step === 'failed'
          ? 'connectStepFailed'
          : step === 'unknown'
            ? 'connectStepUnknown'
            : 'connectStepAutomatic'
  function run() {
    if (client.value !== 'generic') void connect.connect(client.value)
  }
  async function chooseProject() {
    const path = await memory.chooseProject()
    if (path) projectPath.value = path
  }
  function installProject() {
    if (client.value === 'generic') void connect.copyRules()
    else void connect.installProjectRules(client.value, projectPath.value)
  }
  watch(
    generic,
    (value) => {
      if (value) void connect.loadSnippets()
    },
    { immediate: true }
  )
  onMounted(() => {
    void connect.refreshStatus()
    void memory.loadProjects()
  })
</script>
<style scoped src="./connect.css"></style>
