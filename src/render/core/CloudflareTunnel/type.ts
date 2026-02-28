export type ZoneType = {
  id: string
  name: string
  account: {
    id: string
    name: string
  }
}

export type CloudflareTunnelDnsRecord = {
  subdomain: string
  localService: string
  zoneId: string
  zoneName: string
}
