/**
 * fork 的轻量 IPC 发送工具：只依赖运行时 process.send，避免入口为发送结果加载 Fn
 * 工具集合的安装/版本/解压依赖。Fn 继续重导出原名称，模块及插件的导入无需迁移。
 * 保留原 code/on/key 协议：0 为成功，1 为失败，200 为非终态进度。
 */
export const ProcessSendSuccess = (key: string, data: any, on?: boolean) => {
  process?.send?.({ on, key, info: { code: 0, data } })
}

/** 错误字符串及可选业务 errorCode 与原实现一致，不把进度或传输失败伪装为成功。 */
export const ProcessSendError = (key: string, error: any, on?: boolean) => {
  const errorCode =
    error && typeof error === 'object' && typeof error.code === 'string' ? error.code : undefined
  const msg = error instanceof Error ? error.toString() : `${error}`
  process?.send?.({ on, key, info: { code: 1, msg, ...(errorCode ? { errorCode } : {}) } })
}

/** 进度事件不改变请求的终态，继续交由原 ForkItem 回调处理。 */
export const ProcessSendLog = (key: string, msg: any, on?: boolean) => {
  process?.send?.({ on, key, info: { code: 200, msg } })
}
