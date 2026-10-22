export interface OwnedTerminal {
  ptyKey: string
  end: boolean
  mount(host: any): Promise<unknown>
  stop(): Promise<unknown>
  destroy(): void
}
// Cancellation must wait for the initialization handshake before choosing a PTY key.
export class InstallationTerminal {
  private mounting?: Promise<unknown>
  private stopping?: Promise<unknown>
  private disposing?: Promise<void>
  constructor(
    readonly terminal: OwnedTerminal,
    private readonly beforeDestroy?: () => void
  ) {}
  mount(host: any) {
    return (this.mounting ??= this.terminal.mount(host))
  }
  stop(): Promise<unknown> {
    return (this.stopping ??= Promise.resolve().then(async () => {
      await this.mounting?.catch(() => undefined)
      if (this.terminal.ptyKey && !this.terminal.end) await this.terminal.stop()
    }))
  }
  dispose(): Promise<void> {
    return (this.disposing ??= this.stop()
      .finally(() => {
        try {
          this.beforeDestroy?.()
        } finally {
          this.terminal.destroy()
        }
      })
      .then(() => undefined))
  }
}
