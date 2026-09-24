import type { OnlineVersionFetchItem } from '@fork/util/OnlineVersionFetch/base'
import { OnlineVersionFetchBase } from '@fork/util/OnlineVersionFetch/base'

class KafkaOnlineVersionFetch extends OnlineVersionFetchBase {
  private _fetch(): Promise<OnlineVersionFetchItem[]> {
    return this.fetchFromApacheCDN(
      'https://downloads.apache.org/kafka/',
      'https://archive.apache.org/dist/kafka/',
      /href="(\d+\.\d+\.\d+)\//,
      (baseUrl, version) => new URL(`${version}/kafka_2.13-${version}.tgz`, baseUrl).toString(),
      2,
      '3.5.0'
    )
  }

  win(): Promise<OnlineVersionFetchItem[]> {
    return this._fetch()
  }

  mac(_arch: 'x86' | 'arm'): Promise<OnlineVersionFetchItem[]> {
    return this._fetch()
  }

  linux(_arch: 'x86' | 'arm'): Promise<OnlineVersionFetchItem[]> {
    return this._fetch()
  }
}

export default new KafkaOnlineVersionFetch()
