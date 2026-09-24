import http from 'node:http'
import https from 'node:https'
import axios from 'axios'
import type { OnlineVersionItem } from '@shared/app'
import { compareVersions } from '@shared/compare-versions'
import { getAxiosProxy } from '../Axios'

export type OnlineVersionFetchItem = OnlineVersionItem & {
  versionSort: string
}

export type GitHubTag = {
  name: string
}

export type GitHubReleasesAssetsItem = {
  name: string
  browser_download_url: string
}

export type GitHubReleases = {
  tag_name: string
  name: string
  assets: GitHubReleasesAssetsItem[]
}

export type GitHubTagVersionFetch = (tag: GitHubTag) => string
export type GitHubTagURLFetch = (version: string) => string
export type GitHubReleaseVersionFetch = (release: GitHubReleases) => string
export type GitHubReleaseURLFetch = (release: GitHubReleases) => string

const axiosBaseOptions = () => ({
  timeout: 30000,
  withCredentials: false,
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false }),
  proxy: getAxiosProxy()
})

const httpGet = (url: string) =>
  axios({
    url,
    method: 'get',
    ...axiosBaseOptions()
  })

const urlExists = async (url: string) => {
  try {
    await axios({
      url,
      method: 'head',
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
      ...axiosBaseOptions()
    })
    return true
  } catch {
    return false
  }
}

const versionToSort = (version: string) =>
  version
    .split('.')
    .map((v) => {
      const vn = parseInt(v)
      if (isNaN(vn)) {
        return '0'
      }
      return `${vn}`
    })
    .join('.')

const sortDesc = (list: OnlineVersionFetchItem[]) =>
  list.sort((a, b) => compareVersions(b.versionSort, a.versionSort))

export class OnlineVersionFetchBase {
  async fetchFromGitHub(
    repo: string,
    versionFetch: GitHubTagVersionFetch,
    mvLength: number,
    urlFetch: GitHubTagURLFetch,
    minVersion: string
  ): Promise<OnlineVersionFetchItem[]> {
    const res = await httpGet(`https://api.github.com/repos/${repo}/tags?page=1&per_page=1000`)
    const html = res.data
    let arr: GitHubTag[] = []
    try {
      if (typeof html === 'string') {
        arr = JSON.parse(html)
      } else {
        arr = html
      }
    } catch {}
    const mVersionDict: Record<string, OnlineVersionFetchItem[]> = {}
    for (const a of arr) {
      const version = versionFetch(a)
      if (!version) {
        continue
      }
      const versionSort = versionToSort(version)
      const mv = versionSort.split('.').slice(0, mvLength).join('.')
      const item: OnlineVersionFetchItem = {
        url: urlFetch(version),
        version,
        mVersion: mv,
        versionSort
      }
      if (minVersion && compareVersions(versionSort, minVersion) < 0) {
        continue
      }
      if (!mVersionDict?.[mv]) {
        mVersionDict[mv] = []
      }
      mVersionDict[mv].push(item)
    }
    const allV: OnlineVersionFetchItem[] = []
    for (const mv in mVersionDict) {
      sortDesc(mVersionDict[mv])
      for (const item of mVersionDict[mv]) {
        if (await urlExists(item.url)) {
          allV.push(item)
          break
        }
      }
    }
    return sortDesc(allV)
  }

  async fetchFromGitHubReleases(
    repo: string,
    versionFetch: GitHubReleaseVersionFetch,
    mvLength: number,
    urlFetch: GitHubReleaseURLFetch,
    minVersion: string
  ): Promise<OnlineVersionFetchItem[]> {
    const res = await httpGet(`https://api.github.com/repos/${repo}/releases?page=1&per_page=1000`)
    const html = res.data
    let arr: GitHubReleases[] = []
    try {
      if (typeof html === 'string') {
        arr = JSON.parse(html)
      } else {
        arr = html
      }
    } catch {}
    const mVersionDict: Record<string, OnlineVersionFetchItem[]> = {}
    for (const a of arr) {
      const version = versionFetch(a)
      if (!version) {
        continue
      }
      const versionSort = version
      const mv = versionSort.split('.').slice(0, mvLength).join('.')
      const u = urlFetch(a)
      if (!u) {
        continue
      }
      const item: OnlineVersionFetchItem = {
        url: u,
        version,
        mVersion: mv,
        versionSort
      }
      if (minVersion && compareVersions(versionSort, minVersion) < 0) {
        continue
      }
      if (!mVersionDict?.[mv]) {
        mVersionDict[mv] = []
      }
      mVersionDict[mv].push(item)
    }
    const allV: OnlineVersionFetchItem[] = []
    for (const mv in mVersionDict) {
      sortDesc(mVersionDict[mv])
      for (const item of mVersionDict[mv]) {
        if (await urlExists(item.url)) {
          allV.push(item)
          break
        }
      }
    }
    return sortDesc(allV)
  }

  async fetchFromApacheCDN(
    cdnUrl: string,
    archiveUrl: string,
    dirRegex: RegExp,
    urlBuild: (baseUrl: string, version: string) => string,
    mvLength: number,
    minVersion: string
  ): Promise<OnlineVersionFetchItem[]> {
    const fetchDirs = async (baseUrl: string) => {
      const versions: string[] = []
      try {
        const res = await httpGet(baseUrl)
        const html = res.data
        const reg = new RegExp(dirRegex.source, 'g')
        let r
        while ((r = reg.exec(html)) !== null) {
          const version = r[1]
          if (version && !versions.includes(version)) {
            versions.push(version)
          }
        }
      } catch (e) {
        console.log('fetchFromApacheCDN fetchDirs: err', e)
      }
      return versions
    }
    const [cdnVersions, archiveVersions] = await Promise.all([
      fetchDirs(cdnUrl),
      fetchDirs(archiveUrl)
    ])
    const newestPerGroup: Record<string, string> = {}
    for (const version of [...cdnVersions, ...archiveVersions]) {
      const versionSort = versionToSort(version)
      if (minVersion && compareVersions(versionSort, minVersion) < 0) {
        continue
      }
      const mv = versionSort.split('.').slice(0, mvLength).join('.')
      const find = newestPerGroup?.[mv]
      if (!find || compareVersions(versionSort, versionToSort(find)) > 0) {
        newestPerGroup[mv] = version
      }
    }
    const allV: OnlineVersionFetchItem[] = []
    for (const mv in newestPerGroup) {
      const version = newestPerGroup[mv]
      const versionSort = versionToSort(version)
      const sources = cdnVersions.includes(version) ? [cdnUrl, archiveUrl] : [archiveUrl]
      for (const baseUrl of sources) {
        const url = urlBuild(baseUrl, version)
        if (await urlExists(url)) {
          allV.push({
            url,
            version,
            mVersion: mv,
            versionSort
          })
          break
        }
      }
    }
    return sortDesc(allV)
  }
}
