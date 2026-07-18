import { join } from 'node:path'
import { mkdirp, readFile, writeFile } from '@shared/fs-extra'
import { existsSync } from 'node:fs'

/**
 * 解压并配置 Nginx
 */
const extractNginxConfig = async () => {
  const { default: compressing } = await import('compressing')
  await compressing.zip.uncompress(join(__static, 'zip/nginx-common.zip'), global.Server.NginxDir!)
  await configureNginxFile()
}

/**
 * 配置 Nginx 文件
 */
const configureNginxFile = async () => {
  const ngconf = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
  const content = await readFile(ngconf, 'utf-8')
  const newContent = content
    .replace(/#PREFIX#/g, global.Server.NginxDir!)
    .replace('#VHostPath#', join(global.Server.BaseDir!, 'vhost/nginx'))

  await writeFile(ngconf, newContent)
  await writeFile(join(global.Server.NginxDir!, 'common/conf/nginx.conf.default'), newContent)
}

/**
 * 设置 Nginx 配置
 */
export const SetupNginxConfig = () => {
  const httpdconf = join(global.Server.ApacheDir!, 'common/conf/')
  mkdirp(httpdconf).then().catch()

  const ngconf = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
  if (!existsSync(ngconf)) {
    void extractNginxConfig().catch(() => {})
  }
}
