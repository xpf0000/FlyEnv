import { join } from 'path'
import type { AppHost } from '@shared/app'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs-extra'
import NodeRSA from 'node-rsa'

const RSAPublickKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDOfO7Yt4oeDdrK5/maLWE0MjP5
xVe/YNYFmfX95IlJ5EHwGSgtxrwX3cDr12UPmVYRYy8acOfHjYG6jbd/0s/1VpPQ
A5BspwCNHG0uc2xoaqyeOl1XAjIpcK2FU8n3Aph8ZowV6BmQyYi/NT6QRrsWI6Q6
nxhT1GP88r4zyT2EzwIDAQAB
-----END PUBLIC KEY-----
`
const RSAPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIICXQIBAAKBgQDOfO7Yt4oeDdrK5/maLWE0MjP5xVe/YNYFmfX95IlJ5EHwGSgt
xrwX3cDr12UPmVYRYy8acOfHjYG6jbd/0s/1VpPQA5BspwCNHG0uc2xoaqyeOl1X
AjIpcK2FU8n3Aph8ZowV6BmQyYi/NT6QRrsWI6Q6nxhT1GP88r4zyT2EzwIDAQAB
AoGABKYcbIWpVubh86qIXJfD9fxhXjC6uoTQHL0sJCS2kJLShzjRxkIQrwrfko+9
Zz4BCZAtmc9L8Jq3fn89T+PrqaR9CpXviA1wS89XoWbz4IOgGLxNwPXqKL+fQzuS
LtovHK/QuIvPxOfvzpgH+dFfOlUD3Mp3qPIm9SdlWSrojEUCQQD8XT4lRX+hrdl8
IPkfxxMz7YHz1mpTk68iPpkyjpm5jxBe6pPkm/nuD9RorBv8Rwg4z6LUYHOTnUG4
YwelPnitAkEA0XZ963VZSlDWNyquJ8ncSJkNHIqyGLGfCiiuC6VMvTOa4zY4ynDi
0JdyrZcUBkJ8DEhDwqi1sPYLPLKxQfl26wJBAN1GCHJ3sIQbwgDzjFwPmkfCrVoW
m53ydPHqvzq0DBfGWA1RUyF0nbzdxlmM5vDZe10MufHLLCu3C+PXeOGrl/UCQQCu
ZtFrRhblWK8z2baN7HYcgEq5dAXbp7C6/aoEikp90kTpX9EjRaCkeyUBwiPrHlo4
w8afgmddg09R55rNSs+nAkBEPnQ516OIQR4iXiECJsXH5VNWmVUX/c0OIj5AXUo1
z5MAQJ18Womv0CVnMZoDkn80JVA2qnOwsD/K6GSkFxJJ
-----END RSA PRIVATE KEY-----
`

export const fetchHostList = async () => {
  const hostfile = join(global.Server.BaseDir!, 'host.json')
  let hostList: Array<AppHost> = []
  if (existsSync(hostfile)) {
    let content = (await readFile(hostfile, 'utf-8')).trim()
    if (content.length === 0) {
      return hostList
    }
    console.log('fetchHostList content: ', content.startsWith('['), content.endsWith(']'))
    if (content.startsWith('[') && content.endsWith(']')) {
      const key = new NodeRSA(RSAPrivateKey)
      const c = key.encryptPrivate(content, 'base64')
      console.log('fetchHostList ccc: ', c)
      await writeFile(hostfile, c)
    } else {
      const key = new NodeRSA(RSAPublickKey)
      try {
        content = key.decryptPublic(content, 'utf8')
      } catch (e) {}
    }
    try {
      hostList = JSON.parse(content)
    } catch (e) {
      console.log(e)
      if (content.length > 0) {
        const hostBackFile = join(global.Server.BaseDir!, 'host.back.json')
        await writeFile(hostBackFile, content)
      }
      throw e
    }
  }
  return hostList
}

export const saveHostList = async (list: any) => {
  const hostfile = join(global.Server.BaseDir!, 'host.json')
  list.forEach((h: any) => {
    if (!h.type) {
      h.type = 'php'
    }
  })
  let content = JSON.stringify(list)
  const key = new NodeRSA(RSAPrivateKey)
  content = key.encryptPrivate(content, 'base64')
  await writeFile(hostfile, content)
}
