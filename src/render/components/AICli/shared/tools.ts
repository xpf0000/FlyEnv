import type { AICliTool, AICliProvider, ProviderApply } from './types'

/**
 * Claude Code adapter (#712 phase-1).
 * Claude Code reads its model backend from environment variables:
 *   ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN (or ANTHROPIC_API_KEY), ANTHROPIC_MODEL
 * So we map any provider to those env vars (no config-file write needed).
 */
const claudeApply = (p: AICliProvider, model?: string): ProviderApply => {
  const env: Record<string, string> = {}
  const base = p.baseURL?.replace(/\/+$/, '')
  if (base) {
    env.ANTHROPIC_BASE_URL = base
  }
  if (p.apiKey) {
    env.ANTHROPIC_AUTH_TOKEN = p.apiKey
    env.ANTHROPIC_API_KEY = p.apiKey
  }
  const m = model || p.defaultModel
  if (m) {
    env.ANTHROPIC_MODEL = m
  }
  return { env }
}

export const ClaudeCode: AICliTool = {
  flag: 'claudecode',
  name: 'Claude Code',
  icon: import('@/svg/cliproxyapi.svg?raw'),
  docUrl: 'https://docs.claude.com/en/docs/claude-code/overview',
  depCmd: 'node -v',
  depLabel: 'Node.js',
  install: {
    macOS: ['npm install -g @anthropic-ai/claude-code'],
    Linux: ['npm install -g @anthropic-ai/claude-code'],
    Windows: ['npm install -g @anthropic-ai/claude-code'],
    versionCmd: 'claude --version',
    updateCmd: 'npm install -g @anthropic-ai/claude-code@latest',
    launchCmd: 'claude'
  },
  applyProvider: claudeApply
}

export const AI_CLI_TOOLS: AICliTool[] = [ClaudeCode]

export const findTool = (flag: string): AICliTool | undefined =>
  AI_CLI_TOOLS.find((t) => t.flag === flag)
