# PhpWebStudy

<img src="http://mbimage.ybvips.com/electron/phpwebstudy/screenshots/512x512.png" width="256" alt="App Icon" />

## Php and Web development environment manage tool for MacOS system

[![GitHub release](https://img.shields.io/github/release/xpf0000/PhpWebStudy.svg)](https://github.com/xpf0000/PhpWebStudy/releases)  [![Total Downloads](https://img.shields.io/github/downloads/xpf0000/PhpWebStudy/total.svg)](https://github.com/xpf0000/PhpWebStudy/releases)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/R5R2OJXTM)

PhpWebStudy is an open source, free personal project, created for PHP and Web engineers using MacOS systems for development, to provide a more simple and useful tool to manage the local server environment.

By integrating the tedious tasks such as start/restart commands for each software, configuration file viewing and modification, and log file checking into one software, developers can focus more on the real development work.

Visit the website for detailed descriptions and tutorials on how to use it:

[https://www.macphpstudy.com](https://www.macphpstudy.com)

[Documentation](https://www.macphpstudy.com/help-0-1.html)

[https://www.phpwebstudy.com](https://www.phpwebstudy.com)

[Documentation](https://www.phpwebstudy.com/help-0-1.html)

## ✨ 特性

- 简洁明了的图形操作界面
- 同时运行多个PHP版本, 支持 PHP5.x - PHP8.x
- 各软件版本切换 根据开发需要 选择对应的版本进行开发调试
- 各软件自定义配置
- 日志文件即时查看
- host管理
- 常见PHP项目url rewrite一键设置
- 一键切换brew国内源, 解决brew安装更新慢的问题
- 一键生成SSL自签名证书
- PHP代码混淆, 混淆单个文件或整个项目
- 开发中常用的小工具, 时间戳转换, 编码/解码, 端口占用一键清理

## 🖥 应用界面

![01.png](https://www.macphpstudy.com/image/index/main.png)
![02.png](https://www.macphpstudy.com/image/index/screen3.png)
![03.png](https://www.macphpstudy.com/image/index/screen4.png)
![04.png](https://www.macphpstudy.com/image/index/screen5.png)
![05.png](https://www.macphpstudy.com/image/index/screen6.png)
![08.png](https://www.macphpstudy.com/image/index/screen7.png)
![07.png](https://www.macphpstudy.com/image/index/screen8.png)

## 💽 安装稳定版

1. [GitHub](https://github.com/xpf0000/PhpWebStudy/releases) 提供了已经编译好的稳定版安装包

最新版intel和Apple M安装包已经分开了, 带arm64的适用于Apple M, 不带的适用于intel, 注意不要下错了


2. 使用brew安装

```
brew install phpwebstudy
```

3. 当然你也可以自己克隆代码编译打包。

## ⌨️ 本地开发

### 克隆代码

```bash
git clone git@github.com:xpf0000/PhpWebStudy.git
```

### 安装依赖

```bash
cd PhpWebStudy
yarn install
```

天朝大陆用户建议使用淘宝的 npm 源

```bash
npm config set registry 'https://registry.npm.taobao.org'
export ELECTRON_MIRROR='https://npm.taobao.org/mirrors/electron/'
export SASS_BINARY_SITE='https://npm.taobao.org/mirrors/node-sass'
```

### 开发模式

```bash
yarn run dev
```

### 编译打包

```bash
yarn run build
```

完成之后可以在项目的 `release` 目录看到编译打包好的应用文件

### PHP版本

brew自身库并不支持太老的PHP版本, 所以想要使用较老的PHP版本, 需要使用brew的第三方库
例如:

[shivammathur/php](https://github.com/shivammathur/homebrew-php)

[phpbrew/phpbrew](https://github.com/phpbrew/phpbrew)

本应用使用的是shivammathur/php, 默认会自动添加shivammathur/php库到brew中, 但是因为'网络问题', 可能会添加失败,
用户可以自行添加, 添加命令:

```
brew tap shivammathur/php
```

### PHP扩展

当前一键安装包括: ionCube memcache memcached redis swoole xdebug ssh2 pdo_sqlsrv imagick mongodb yaf

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
- [vite](https://vitejs.dev/)
- [Vue3](https://v3.vuejs.org/)
- [VueX](https://vuex.vuejs.org/)
- [Vue Router](https://router.vuejs.org/)
- [Element-Plus](https://element-plus.org/en-US/)

## 问题反馈及建议

提Issues, 或者扫码加QQ群

<img style="box-shadow: 0 0 5px 0 rgba(170,170,170,0.3)" src="https://www.macphpstudy.com/image/index/qrcode0@2x.png">

## 打赏

开源不易, 且行且珍惜

![wechat.png](https://www.macphpstudy.com/image/index/qrcode1@2x.png)

![alipay.png](https://www.macphpstudy.com/image/index/qrcode2@2x.png)

![ko-fi.png](https://www.macphpstudy.com/image/index/qrcode3@2x.png)

## 📜 开源许可

[BSD 3-Clause License](https://github.com/xpf0000/PhpWebStudy/blob/master/LICENSE)

Copyright (c) 2023, 徐鹏飞
