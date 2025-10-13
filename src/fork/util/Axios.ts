export const getAxiosProxy = () => {
  const proxyUrl =
    Object.values(global?.Server?.Proxy ?? {})?.find((s: string) => s.includes('://')) ?? ''
  let proxy: any = {}
  if (proxyUrl) {
    try {
      const u = new URL(proxyUrl)
      proxy.protocol = u.protocol.replace(':', '')
      proxy.host = u.hostname
      proxy.port = u.port
    } catch {
      proxy = undefined
    }
  } else {
    proxy = undefined
  }
  console.log('getAxiosProxy: ', proxy)
  return proxy
}
