# BuildPhp

<img src="https://raw.githubusercontent.com/xpf0000/BuildPhp/master/static/512x512.png" width="256" alt="App Icon" />

[English](./README.md) | 简体中文

## mac下PHP和web开发环境管理工具

[![GitHub release](https://img.shields.io/github/release/xpf0000/BuildPhp.svg)](https://github.com/xpf0000/BuildPhp/releases)  [![Total Downloads](https://img.shields.io/github/downloads/xpf0000/BuildPhp/total.svg)](https://github.com/xpf0000/BuildPhp/releases)

BuildPhp 是一款mac下PHP和web开发环境管理工具,包含php,nginx,apache,msyql,memcached,redis以及host管理
## ✨ 特性

- 简洁明了的图形操作界面
- 版本切换 根据开发需要 选择对应的版本进行开发调试
- 各软件自定义配置
- 日志文件即时查看
- host管理
- 常见PHP项目url rewrite一键设置
- 一键生成SSL自签名证书
- 开发中常用的小工具, 时间戳转换, 编码/解码

## 💽 安装稳定版

[GitHub](https://github.com/xpf0000/BuildPhp/releases) 提供了已经编译好的稳定版安装包，当然你也可以自己克隆代码编译打包。

## 🖥 应用界面

![scan.png](https://raw.githubusercontent.com/xpf0000/BuildPhp/master/screenshots/scan.jpg)
![screen1.gif](https://raw.githubusercontent.com/xpf0000/BuildPhp/master/screenshots/screen1.gif)
![screen2.gif](https://raw.githubusercontent.com/xpf0000/BuildPhp/master/screenshots/screen2.gif)
![screen3.gif](https://raw.githubusercontent.com/xpf0000/BuildPhp/master/screenshots/screen3.gif)

## ⌨️ 本地开发

### 克隆代码

```bash
git clone git@github.com:xpf0000/BuildPhp.git
```

### 安装依赖

```bash
cd BuildPhp
npm install
```

天朝大陆用户建议使用淘宝的 npm 源

```bash
npm config set registry 'https://registry.npm.taobao.org'
export ELECTRON_MIRROR='https://npm.taobao.org/mirrors/electron/'
export SASS_BINARY_SITE='https://npm.taobao.org/mirrors/node-sass'
```

如果喜欢 [Yarn](https://yarnpkg.com/)，也可以使用 `yarn` 安装依赖

### 开发模式

```bash
npm run dev
```

### 编译打包

```bash
npm run build
```

完成之后可以在项目的 `release` 目录看到编译打包好的应用文件

### Mysql初始账号和密码

Mysql初始账号密码是root root, 可以使用phpmyadmin或其他db工具使用

### PHP扩展

当前一键安装包括: ionCube memcache memcached redis swoole

这边会收集反馈, 添加到一键安装里

未添加到一键安装里的 使用如下方法安装 替换成自己的PHP版本

```bash
cd 扩展目录
/usr/local/Cellar/php@7.2.34/7.2.34/bin/phpize
./configure --with-php-config=/usr/local/Cellar/php@7.2.34/7.2.34/bin/php-config
make
make install
```


## 🛠 技术栈

- [Electron](https://electronjs.org/)
- [Vue](https://vuejs.org/) + [VueX](https://vuex.vuejs.org/) + [Element](https://element.eleme.io)

## 🤝 参与共建 [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](http://makeapullrequest.com)

如果你有兴趣参与共同开发，欢迎 FORK 和 PR。

## 📜 开源许可

基于 [MIT license](https://opensource.org/licenses/MIT) 许可进行开源。
