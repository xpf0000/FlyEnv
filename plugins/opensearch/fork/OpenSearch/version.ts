import type { OnlineVersionFetchItem } from '@fork/util/OnlineVersionFetch/base'
import { OnlineVersionFetchBase } from '@fork/util/OnlineVersionFetch/base'

class OpenSearchVersionFetch extends OnlineVersionFetchBase {
  private _fetch(urlFetch: (version: string) => string): Promise<OnlineVersionFetchItem[]> {
    return this.fetchFromGitHub(
      'opensearch-project/OpenSearch',
      (tag) => tag.name.match(/^\d+\.\d+\.\d+$/)?.[0] ?? '',
      2,
      urlFetch,
      '2.19.0'
    )
  }

  win(): Promise<OnlineVersionFetchItem[]> {
    return this._fetch(
      (version) =>
        `https://artifacts.opensearch.org/releases/bundle/opensearch/${version}/opensearch-${version}-windows-x64.zip`
    )
  }

  mac(_arch: 'x86' | 'arm'): Promise<OnlineVersionFetchItem[]> {
    // OpenSearch ships no official macOS builds; macOS installs come from
    // Homebrew (brewinfo) or manual copies picked up by the local scan.
    return Promise.resolve([])
  }

  linux(arch: 'x86' | 'arm'): Promise<OnlineVersionFetchItem[]> {
    const archName = arch === 'arm' ? 'arm64' : 'x64'
    return this._fetch(
      (version) =>
        `https://artifacts.opensearch.org/releases/bundle/opensearch/${version}/opensearch-${version}-linux-${archName}.tar.gz`
    )
  }
}

export default new OpenSearchVersionFetch()
