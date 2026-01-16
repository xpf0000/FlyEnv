import { shell } from 'electron'
import type { CallbackFn } from '@shared/app'
import _node_machine_id from 'node-machine-id'
import axios from 'axios'
import { getAxiosProxy } from '../../fork/util/Axios'
import http from 'http'
import url from 'url'
import { I18nT } from '@lang/index'

const { machineId } = _node_machine_id
// 添加常量定义
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
/**
 * GitHub OAuth
 */
class OAuth {
  private code = ''
  private callBack: CallbackFn | undefined
  private server: http.Server | null = null
  private readonly PORT = 32481
  private readonly REDIRECT_URI = `http://127.0.0.1:${this.PORT}/callback`
  private readonly GITHUB_CLIENT_ID = 'Ov23liF7xr41xEMUYAEW' // 需要替换为实际的 GitHub Client ID
  private readonly SCOPES = [] // 请求的权限范围
  private isCancelled = false
  private uuid = ''

  public fetchUser() {
    return new Promise(async (resolve) => {
      if (!global.Server.UserUUID) {
        resolve({
          code: 0,
          data: {}
        })
      }
      if (!this.uuid) {
        this.uuid = await machineId()
      }

      const data = {
        user_uuid: global.Server.UserUUID,
        uuid: this.uuid
      }

      console.log('fetchUser data: ', data)

      try {
        const res = await axios({
          url: 'https://api.one-env.com/api/app/user_giuhub_auth',
          method: 'post',
          data,
          proxy: getAxiosProxy(),
          timeout: 30000 // 30秒超时
        })

        if (res.data && res.data?.data?.user) {
          resolve({
            code: 0,
            data: res.data.data
          })
        } else {
          resolve({
            code: 0,
            data: {}
          })
        }
      } catch (e: any) {
        console.log('user_giuhub_auth error: ', e)
        resolve({
          code: 0,
          data: {}
        })
      }
    })
  }

  public fetchUserLicense() {
    return new Promise(async (resolve) => {
      if (!global.Server.UserUUID) {
        resolve({
          code: 0,
          data: []
        })
      }

      if (!this.uuid) {
        this.uuid = await machineId()
      }
      const data = {
        user_uuid: global.Server.UserUUID,
        uuid: this.uuid
      }

      try {
        const res = await axios({
          url: 'https://api.one-env.com/api/app/user_giuhub_license',
          method: 'post',
          data,
          proxy: getAxiosProxy(),
          timeout: 30000 // 30秒超时
        })

        if (res.data && Array.isArray(res.data?.data)) {
          resolve({
            code: 0,
            data: res.data.data
          })
        } else {
          resolve({
            code: 0,
            data: []
          })
        }
      } catch (e: any) {
        console.log('user_giuhub_license error: ', e)
        resolve({
          code: 0,
          data: []
        })
      }
    })
  }

  public delBind(uuid: string, license: string) {
    return new Promise(async (resolve) => {
      const data = {
        user_uuid: global.Server.UserUUID,
        uuid,
        license
      }

      try {
        const res = await axios({
          url: 'https://api.one-env.com/api/app/user_giuhub_license_del',
          method: 'post',
          data,
          proxy: getAxiosProxy(),
          timeout: 30000 // 30秒超时
        })

        if (res.data && Array.isArray(res.data?.data)) {
          resolve({
            code: 0,
            data: res.data.data
          })
        } else {
          resolve({
            code: 1,
            msg: res?.data?.message ?? I18nT('base.fail')
          })
        }
      } catch (e: any) {
        console.log('user_giuhub_license_del error: ', e)
        resolve({
          code: 1,
          msg: `${e}`
        })
      }
    })
  }

  public addBind(uuid: string, license: string) {
    return new Promise(async (resolve) => {
      const data = {
        user_uuid: global.Server.UserUUID,
        uuid,
        license
      }

      try {
        const res = await axios({
          url: 'https://api.one-env.com/api/app/user_giuhub_license_add',
          method: 'post',
          data,
          proxy: getAxiosProxy(),
          timeout: 30000 // 30秒超时
        })

        if (res.data && Array.isArray(res.data?.data)) {
          resolve({
            code: 0,
            data: res.data.data
          })
        } else {
          resolve({
            code: 1,
            msg: res?.data?.message ?? I18nT('base.fail')
          })
        }
      } catch (e: any) {
        console.log('user_giuhub_license_add error: ', e)
        resolve({
          code: 1,
          msg: `${e}`
        })
      }
    })
  }

  /**
   * 使用code请求服务端接口获取用户信息
   * @private
   */
  private async login() {
    try {
      if (!this.uuid) {
        this.uuid = await machineId()
      }
      const data = {
        uuid: this.uuid,
        code: this.code
      }

      console.log('发送登录请求到服务端:', data)

      const res = await axios({
        url: 'https://api.one-env.com/api/app/user_giuhub_auth_by_code',
        method: 'post',
        data,
        proxy: getAxiosProxy(),
        timeout: 30000 // 30秒超时
      })

      console.log('服务端响应:', res.data)

      if (res.data && res.data?.data?.user) {
        this.callBack?.(res.data.data)
      } else {
        throw new Error(res.data?.message || '登录失败')
      }
    } catch (error: any) {
      console.error('登录过程出错:', error)
      this.callBack?.({
        success: false,
        message: error.message || '登录失败',
        error: error.response?.data || error
      })
    }
  }

  /**
   * 创建 HTTP 服务器接收 GitHub 回调
   */
  private createServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        if (!req.url) {
          res.writeHead(400)
          res.end('Bad Request')
          return
        }

        const parsedUrl = url.parse(req.url, true)

        if (parsedUrl.pathname === '/callback') {
          const code = parsedUrl.query.code as string
          const error = parsedUrl.query.error as string
          const errorDescription = parsedUrl.query.error_description as string

          if (this.isCancelled) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(this.getHtmlResponse('授权已取消', '用户取消了授权流程'))
            return
          }

          if (error) {
            // GitHub 返回错误
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(this.getHtmlResponse('授权失败', `错误: ${error}`, errorDescription))

            reject(new Error(errorDescription || error))
            this.closeServer()
            return
          }

          if (code) {
            this.code = code

            // 发送成功响应页面
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(this.getHtmlResponse('授权成功', '正在登录，请稍候...', '', true))

            // 关闭服务器
            setTimeout(() => {
              this.closeServer()
            }, 1000)

            resolve(code)
          } else {
            // 没有 code 参数
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(this.getHtmlResponse('授权失败', '未收到授权码'))

            reject(new Error('未收到授权码'))
            this.closeServer()
          }
        } else if (parsedUrl.pathname === '/health') {
          // 健康检查端点
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'ok', port: this.PORT }))
        } else {
          res.writeHead(404)
          res.end('Not Found')
        }
      })

      this.server.on('error', (err) => {
        console.error('HTTP服务器错误:', err)
        if (!this.isCancelled) {
          reject(err)
        }
      })

      this.server.on('clientError', (err, socket) => {
        console.error('客户端连接错误:', err)
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      })

      this.server.listen(this.PORT, '127.0.0.1', () => {
        console.log(`OAuth回调服务器已启动，监听端口 ${this.PORT}`)
      })

      // 设置超时
      setTimeout(() => {
        if (this.server && this.server.listening) {
          console.log('服务器启动超时，正在关闭...')
          this.closeServer()
          reject(new Error('服务器启动超时'))
        }
      }, 60000)
    })
  }

  /**
   * 生成 HTML 响应页面
   */
  private getHtmlResponse(
    title: string,
    message: string,
    detail?: string,
    autoClose: boolean = false
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
            }
            .container {
              background: rgba(255, 255, 255, 0.1);
              backdrop-filter: blur(10px);
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
              max-width: 500px;
              width: 90%;
            }
            h1 {
              margin-top: 0;
              font-size: 2.5em;
              margin-bottom: 20px;
            }
            p {
              font-size: 1.2em;
              line-height: 1.6;
              margin-bottom: 10px;
            }
            .detail {
              font-size: 0.9em;
              opacity: 0.8;
              margin-top: 20px;
              padding: 10px;
              background: rgba(0, 0, 0, 0.2);
              border-radius: 8px;
            }
            .loading {
              display: ${autoClose ? 'block' : 'none'};
              width: 50px;
              height: 50px;
              border: 3px solid rgba(255, 255, 255, 0.3);
              border-radius: 50%;
              border-top-color: #fff;
              animation: spin 1s ease-in-out infinite;
              margin: 30px auto;
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${title}</h1>
            <p>${message}</p>
            ${detail ? `<div class="detail">${detail}</div>` : ''}
            <div class="loading"></div>
          </div>
          ${
            autoClose
              ? `
            <script>
              setTimeout(() => {
                window.close();
              }, 2000);
            </script>
          `
              : ''
          }
        </body>
      </html>
    `
  }

  /**
   * 关闭 HTTP 服务器
   */
  private closeServer() {
    if (this.server) {
      try {
        this.server.close()
        console.log('OAuth回调服务器已关闭')
      } catch (err) {
        console.error('关闭服务器时出错:', err)
      } finally {
        this.server = null
      }
    }
  }

  /**
   * 构建 GitHub 授权 URL
   */
  private getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.GITHUB_CLIENT_ID,
      redirect_uri: this.REDIRECT_URI,
      scope: this.SCOPES.join(' '),
      state: this.generateState(), // 防止 CSRF 攻击
      allow_signup: 'true'
    })

    return `${GITHUB_AUTH_URL}?${params.toString()}`
  }

  /**
   * 生成随机 state 参数
   */
  private generateState(): string {
    return (
      Math.random().toString(36).substring(2) +
      Date.now().toString(36) +
      Math.random().toString(36).substring(2)
    )
  }

  /**
   * 启动 OAuth 流程
   */
  private async startAuthFlow(): Promise<string> {
    // 先创建服务器
    const serverPromise = this.createServer()

    // 构建 GitHub 授权 URL
    const authUrl = this.getAuthUrl()
    console.log('GitHub授权URL:', authUrl)

    await shell.openExternal(authUrl)

    // 等待用户授权并返回 code
    return await serverPromise
  }

  /**
   * 开始授权登录
   * 开启一个端口号为32481的http服务 用于接收code
   * 接收到code后 调用login方法获取用户信息
   */
  startOAuth(): Promise<any> {
    return new Promise(async (resolve) => {
      try {
        this.isCancelled = false
        this.callBack = resolve

        // 启动授权流程获取 code
        const code = await this.startAuthFlow()

        if (code && !this.isCancelled) {
          this.code = code
          // 使用 code 调用服务端登录接口
          await this.login()
        }
      } catch (error: any) {
        console.error('OAuth流程出错:', error)
        resolve({
          success: false,
          message: error.message || '授权流程出错',
          error: error.toString()
        })
      } finally {
        this.closeServer()
      }
    })
  }

  /**
   * 取消授权登录
   * 关闭http服务
   */
  cancel() {
    console.log('用户取消授权流程')
    this.isCancelled = true
    this.closeServer()
    this.callBack?.({
      success: false,
      message: '用户取消了授权流程',
      cancelled: true
    })
    this.callBack = undefined
  }
}

export default new OAuth()
