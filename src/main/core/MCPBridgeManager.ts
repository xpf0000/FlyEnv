import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * MCP stdio bridge 脚本在运行时的外部落地管理。
 *
 * 生产环境中 static 资源位于 asar 内部，外部 Node 进程无法直接执行。
 * 因此在首次需要时将已打包好的 bridge 脚本复制到 userData/mcp/ 下，
 * 并返回该外部可执行路径给渲染层生成客户端配置片段。
 */
export default class MCPBridgeManager {
  /** bridge 脚本在 app 资源中的路径（asar 内也可被 Electron 进程读取） */
  private sourcePath: string
  /** bridge 脚本复制到外部后的可执行路径 */
  private externalDir: string
  private externalPath: string

  constructor() {
    this.sourcePath = join(global.Server.Static!, 'mcp', 'flyenv-mcp-stdio.mjs')
    this.externalDir = join(dirname(global.Server.BaseDir!), 'mcp')
    this.externalPath = join(this.externalDir, 'flyenv-mcp-stdio.mjs')
  }

  /** 确保外部存在最新 bridge 脚本，返回外部路径 */
  ensureBridge(): string {
    try {
      if (!existsSync(this.sourcePath)) {
        console.log('MCPBridgeManager source not found:', this.sourcePath)
        return this.externalPath
      }
      if (!existsSync(this.externalDir)) {
        mkdirSync(this.externalDir, { recursive: true })
      }
      const source = readFileSync(this.sourcePath, 'utf-8')
      let write = true
      if (existsSync(this.externalPath)) {
        const existing = readFileSync(this.externalPath, 'utf-8')
        write = existing !== source
      }
      if (write) {
        writeFileSync(this.externalPath, source, 'utf-8')
      }
    } catch (e) {
      console.log('MCPBridgeManager ensureBridge error: ', e)
    }
    return this.externalPath
  }

  getBridgePath(): string {
    return this.ensureBridge()
  }
}
