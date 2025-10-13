import axios from 'axios'
import { compareVersions } from 'compare-versions'
import { getAxiosProxy } from '../../util/Axios'

function isStableTag(tag: string, name: string) {
  if (name === 'tomcat') {
    const reg = /^\d{1,3}(\.\d{1,3}){2,2}-jdk\d{1,3}$/g
    return reg.test(tag)
  }
  if (name === 'postgres') {
    const reg = /^\d{1,3}(\.\d{1,3}){1,1}$/g
    return reg.test(tag)
  }
  if (name === 'axllent/mailpit') {
    const reg = /^v\d{1,3}(\.\d{1,3}){2,2}$/g
    return reg.test(tag)
  }
  if (name === 'openjdk') {
    const reg = /^\d{1,3}((\.\d{1,3}){2,2})?([_\.]\d+)?-jdk$/g
    return reg.test(tag)
  }
  if (name === 'erlang') {
    const reg = /^\d{1,3}(\.\d{1,3}){3,3}$/g
    return reg.test(tag)
  }
  if (name === 'quay.io/coreos/etcd') {
    const reg = /^v\d{1,3}(\.\d{1,3}){2,2}$/g
    return reg.test(tag)
  }
  if (name === 'getmeili/meilisearch') {
    const reg = /^v\d{1,3}(\.\d{1,3}){2,2}$/g
    return reg.test(tag)
  }
  if (name === 'typesense/typesense') {
    const reg = /^\d{1,3}(\.\d{1,3}){1,2}$/g
    return reg.test(tag)
  }
  if (name === 'eclipse-temurin') {
    if (tag.startsWith('8u') && tag.endsWith('-jdk')) {
      return true
    }
    const reg = /^\d{1,3}(\.\d{1,3}){2,2}[_.]\d+-jdk$/g
    return reg.test(tag)
  }
  if (name === 'minio/minio') {
    return false
  }
  const reg = /^\d{1,3}(\.\d{1,3}){2,2}$/g
  return reg.test(tag)
}

// 获取 Docker Hub 镜像 tag（分页）
async function fetchDockerHubTags(image: string): Promise<string[]> {
  const repo = image.includes('/') ? image : `library/${image}`
  const url = `https://hub.docker.com/v2/repositories/${repo}/tags/?page_size=100`
  const tags: string[] = []
  let next = url
  while (next) {
    try {
      const res = await axios.get(next, {
        proxy: getAxiosProxy()
      })
      tags.push(
        ...res.data.results
          .map((item: any) => item.name)
          .filter((tag: string) => {
            return isStableTag(tag, image)
          })
      )
      next = res?.data?.next
    } catch (e) {
      console.log('fetchTags error: ', image, e)
      break
    }
  }
  return tags
}

// 获取 Quay.io 镜像 tag（分页）
async function fetchQuayTags(image: string): Promise<string[]> {
  // image: quay.io/coreos/etcd
  const [, namespace, repo] = image.split('/')
  const url = `https://quay.io/api/v1/repository/${namespace}/${repo}/tag/?limit=100`
  const tags: string[] = []
  let nextPage = 1
  let hasMore = true
  while (hasMore) {
    try {
      const res = await axios.get(`${url}&page=${nextPage}`, {
        proxy: getAxiosProxy()
      })
      tags.push(
        ...res.data.tags
          .map((item: any) => item.name)
          .filter((tag: string) => {
            return isStableTag(tag, image)
          })
      )
      hasMore = res?.data?.has_more
      nextPage++
    } catch (e) {
      console.log('fetchQuayTags error: ', image, e)
      break
    }
  }
  return tags
}

const versionMap = (s: string) => {
  if (/^\d+$/.test(s)) {
    return s
  }
  if (s.startsWith('8u')) {
    const v = s.replace('-jdk', '').replace('b', '').replace('u', '.').replace('-', '.')
    return v
  }
  if (s.includes('-jdk') && !s.endsWith('-jdk')) {
    return s.replace('-jdk', '.')
  }
  let v = 0
  try {
    v = parseInt(s)
    if (isNaN(v)) {
      v = 0
    }
  } catch {}
  return `${v}`
}

const versionSort = (a: string, b: string) => {
  const av = a.split('.').map(versionMap).join('.')
  const bv = b.split('.').map(versionMap).join('.')
  let r = 0
  try {
    r = compareVersions(bv, av)
  } catch {}
  return r
}

async function fetchTags(image: string) {
  let tags: string[] = []
  if (image.startsWith('quay.io/')) {
    tags = await fetchQuayTags(image)
  } else {
    tags = await fetchDockerHubTags(image)
  }
  tags = tags.sort(versionSort)
  return tags
}

export { fetchTags }
