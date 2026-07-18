import type ai from './zh/ai.json'
import type apache from './zh/apache.json'
import type appLog from './zh/appLog.json'
import type aside from './zh/aside.json'
import type base from './zh/base.json'
import type conf from './zh/conf.json'
import type feedback from './zh/feedback.json'
import type fork from './zh/fork.json'
import type host from './zh/host.json'
import type licenses from './zh/licenses.json'
import type mailpit from './zh/mailpit.json'
import type meilisearch from './zh/meilisearch.json'
import type menu from './zh/menu.json'
import type minio from './zh/minio.json'
import type mysql from './zh/mysql.json'
import type nginx from './zh/nginx.json'
import type nodejs from './zh/nodejs.json'
import type ollama from './zh/ollama.json'
import type php from './zh/php.json'
import type podman from './zh/podman.json'
import type prompt from './zh/prompt.json'
import type redis from './zh/redis.json'
import type requestTimer from './zh/requestTimer.json'
import type service from './zh/service.json'
import type setup from './zh/setup.json'
import type tokenGenerator from './zh/token-generator.json'
import type tools from './zh/tools.json'
import type toolType from './zh/toolType.json'
import type tray from './zh/tray.json'
import type update from './zh/update.json'
import type util from './zh/util.json'
import type versionmanager from './zh/versionmanager.json'
import type openclaw from './zh/openclaw.json'
import type hermes from './zh/hermes.json'
import type kimi from './zh/kimi.json'
import type n8n from './zh/n8n.json'
import type rustfs from './zh/rustfs.json'
import type mkcert from './zh/mkcert.json'
import type flutter from './zh/flutter.json'
import type cron from './zh/cron.json'
import type claudeCode from './zh/claude-code.json'
import type codex from './zh/codex.json'
import type openCode from './zh/opencode.json'
import type antigravity from './zh/antigravity.json'
import type copilotCli from './zh/copilot-cli.json'
import type common from './zh/common.json'
import type mcp from './zh/mcp.json'

type AppendStringToKeys<T extends object, Prefix extends string = ''> = {
  [K in keyof T]: K extends string
    ? T[K] extends object
      ? AppendStringToKeys<T[K], `${Prefix}.${K}`>
      : `${Prefix}.${K}`
    : K extends number
      ? T extends readonly any[]
        ? `${Prefix}.${K}`
        : never
      : never
}[keyof T]

export type LangKey =
  | AppendStringToKeys<typeof common, 'common'>
  | AppendStringToKeys<typeof ai, 'ai'>
  | AppendStringToKeys<typeof apache, 'apache'>
  | AppendStringToKeys<typeof appLog, 'appLog'>
  | AppendStringToKeys<typeof aside, 'aside'>
  | AppendStringToKeys<typeof base, 'base'>
  | AppendStringToKeys<typeof conf, 'conf'>
  | AppendStringToKeys<typeof feedback, 'feedback'>
  | AppendStringToKeys<typeof fork, 'fork'>
  | AppendStringToKeys<typeof host, 'host'>
  | AppendStringToKeys<typeof licenses, 'licenses'>
  | AppendStringToKeys<typeof mailpit, 'mailpit'>
  | AppendStringToKeys<typeof meilisearch, 'meilisearch'>
  | AppendStringToKeys<typeof menu, 'menu'>
  | AppendStringToKeys<typeof minio, 'minio'>
  | AppendStringToKeys<typeof mysql, 'mysql'>
  | AppendStringToKeys<typeof nginx, 'nginx'>
  | AppendStringToKeys<typeof nodejs, 'nodejs'>
  | AppendStringToKeys<typeof ollama, 'ollama'>
  | AppendStringToKeys<typeof php, 'php'>
  | AppendStringToKeys<typeof podman, 'podman'>
  | AppendStringToKeys<typeof prompt, 'prompt'>
  | AppendStringToKeys<typeof redis, 'redis'>
  | AppendStringToKeys<typeof requestTimer, 'requestTimer'>
  | AppendStringToKeys<typeof service, 'service'>
  | AppendStringToKeys<typeof setup, 'setup'>
  | AppendStringToKeys<typeof tokenGenerator, 'token-generator'>
  | AppendStringToKeys<typeof tools, 'tools'>
  | AppendStringToKeys<typeof toolType, 'toolType'>
  | AppendStringToKeys<typeof tray, 'tray'>
  | AppendStringToKeys<typeof update, 'update'>
  | AppendStringToKeys<typeof util, 'util'>
  | AppendStringToKeys<typeof versionmanager, 'versionmanager'>
  | AppendStringToKeys<typeof openclaw, 'openclaw'>
  | AppendStringToKeys<typeof hermes, 'hermes'>
  | AppendStringToKeys<typeof kimi, 'kimi'>
  | AppendStringToKeys<typeof n8n, 'n8n'>
  | AppendStringToKeys<typeof rustfs, 'rustfs'>
  | AppendStringToKeys<typeof mkcert, 'mkcert'>
  | AppendStringToKeys<typeof flutter, 'flutter'>
  | AppendStringToKeys<typeof cron, 'cron'>
  | AppendStringToKeys<typeof claudeCode, 'claudeCode'>
  | AppendStringToKeys<typeof codex, 'codex'>
  | AppendStringToKeys<typeof openCode, 'openCode'>
  | AppendStringToKeys<typeof antigravity, 'antigravity'>
  | AppendStringToKeys<typeof copilotCli, 'copilotCli'>
  | AppendStringToKeys<typeof mcp, 'mcp'>
