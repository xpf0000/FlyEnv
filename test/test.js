const { XMLParser, XMLBuilder } = require('fast-xml-parser')
const fs = require('fs')
const path = require('path')

// const content = fs.readFileSync(path.join(__dirname, 'serve.xml'), 'utf-8')
//
// const parser = new XMLParser({
//   ignoreAttributes: false,
//   attributeNamePrefix: '',
//   attributesGroupName: ''
// })
// let jObj = parser.parse(content)

console.log(path.resolve('/usr/bin', 'java'))

console.log(path.resolve('/usr/bin', '/user/x/abc'))
//
// if (!Array.isArray(jObj.Server.Service.Connector)) {
//   jObj.Server.Service.Connector = [jObj.Server.Service.Connector]
//   const cc = `    <Connector port="443" protocol="org.apache.coyote.http11.Http11NioProtocol"
//                maxThreads="150" SSLEnabled="true" scheme="https">
//       <SSLHostConfig sslProtocol="TLS">
//         <Certificate certificateFile="/Users/x/Library/PhpWebStudy/server/CA/1716359255937/CA-1716359255937.crt"
//                      certificateKeyFile="/Users/x/Library/PhpWebStudy/server/CA/1716359255937/CA-1716359255937.key"
//                      certificateChainFile="/Users/x/Library/PhpWebStudy/server/CA/PhpWebStudy-Root-CA.crt"
//                      type="RSA"/>
//       </SSLHostConfig>
//       <SSLHostConfig hostName="www.test.com" sslProtocol="TLS" certificateVerification="false">
//         <Certificate certificateFile="/Users/x/Library/PhpWebStudy/server/CA/1716359255937/CA-1716359255937.crt"
//                      certificateKeyFile="/Users/x/Library/PhpWebStudy/server/CA/1716359255937/CA-1716359255937.key"
//                      certificateChainFile="/Users/x/Library/PhpWebStudy/server/CA/PhpWebStudy-Root-CA.crt"
//                      type="RSA"/>
//       </SSLHostConfig>
//       <SSLHostConfig hostName="www.phphtmltest.com" sslProtocol="TLS" certificateVerification="false">
//         <Certificate certificateFile="/Users/x/Library/PhpWebStudy/server/CA/1722577446167/CA-1722577446167.crt"
//                      certificateKeyFile="/Users/x/Library/PhpWebStudy/server/CA/1722577446167/CA-1722577446167.key"
//                      certificateChainFile="/Users/x/Library/PhpWebStudy/server/CA/PhpWebStudy-Root-CA.crt"
//                      type="RSA"/>
//       </SSLHostConfig>
//     </Connector>`
//
//   const obj = parser.parse(cc)
//
//   console.log(obj)
//
//   jObj.Server.Service.Connector.push(obj.Connector)
// }
//
// const builder = new XMLBuilder({
//   attributeNamePrefix: '',
//   attributesGroupName: '',
//   ignoreAttributes: false,
//   format: true
// })
// const xmlContent = builder.build(jObj)
//
// console.log(xmlContent)
