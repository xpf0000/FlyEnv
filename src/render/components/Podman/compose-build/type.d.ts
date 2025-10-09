type BindItemType = {
  in: string
  out: string
}

/**
 * apache docker compose type
 */
export type ApacheFormType = {
  /**
   * 版本
   */
  version: string
  /**
   * 站点文件夹
   */
  wwwRoot: string
  /**
   * 站点根目录文件夹
   */
  docRoot: string
  /**
   * 端口映射
   */
  ports: BindItemType[]
  /**
   * 挂载映射
   */
  volumes: BindItemType[]
  /**
   * 环境变量配置
   * @example { APACHE_LOG_DIR: '/var/log/apache2', TZ: 'Asia/Shanghai' }
   */
  environment?: Record<string, string>
}
