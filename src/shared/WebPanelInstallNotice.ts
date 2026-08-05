export const WEB_PANEL_INSTALL_NOTICE = 'web-panel-install' as const

export type WebPanelInstallNotice = {
  type: typeof WEB_PANEL_INSTALL_NOTICE
  service: string
}

export const webPanelInstallNotice = (service: string): WebPanelInstallNotice => ({
  type: WEB_PANEL_INSTALL_NOTICE,
  service
})

export const isWebPanelInstallNotice = (value: unknown): value is WebPanelInstallNotice => {
  const notice = value as Partial<WebPanelInstallNotice> | undefined
  return notice?.type === WEB_PANEL_INSTALL_NOTICE && typeof notice.service === 'string'
}
