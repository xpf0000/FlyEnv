# PhpWebStudy

<img src="https://raw.githubusercontent.com/xpf0000/PhpWebStudy/master/build/256x256.png" width="256" alt="App Icon" />

## Php and Web development environment manage tool for MacOS system

[![GitHub release](https://img.shields.io/github/release/xpf0000/PhpWebStudy.svg)](https://github.com/xpf0000/PhpWebStudy/releases)  [![Total Downloads](https://img.shields.io/github/downloads/xpf0000/PhpWebStudy/total.svg)](https://github.com/xpf0000/PhpWebStudy/releases)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/R5R2OJXTM)

PhpWebStudy is a permanent free open source project. created for PHP and Web engineers using MacOS systems for development, to provide a more simple and useful tool to manage the local server environment.
like MAMP PRO XAMPP etc...

Some of you may not trust this program, but I'll just say this. As an independent developer. I am committed to protecting the privacy of my users. I promise that this program will not steal your privacy. This program does not upload anything to anywhere. It can be tested by any person or organization.

Visit the website for detailed descriptions and tutorials on how to use it:

[https://www.macphpstudy.com](https://www.macphpstudy.com)

[Documentation](https://www.macphpstudy.com/help-0-1.html)

[https://www.phpwebstudy.com](https://www.phpwebstudy.com)

[Documentation](https://www.phpwebstudy.com/help-0-1.html)

## ✨ FEATURES

- Simple and clear graphical interface
- Simultaneously run multiple PHP versions, supports PHP5.x - PHP8.x, run as PHP-FPM mode.
- Software version switching Choose the corresponding version for development and debugging according to development needs.
- Quickly create new projects, initialize with the selected framework, support: wordpress, laravel, yii2, symfony, thinkphp, codeIgniter, cakephp, slim
- Local DNS Server, access local sites from phones and other computers using domain names
- Customized configuration for each software
- Instant view of log files
- Site Management, set port number, php version, ssl certificate for each site
- One-click setting of nginx url rewrite for common PHP projects.
- One click to generate SSL self-signed certificate
- PHP code obfuscation, obfuscate a single file or the full project
- Commonly used in the development of tools, timestamp conversion, encoding / decoding, port occupation of one-click cleanup

## 🖥 application interface

![01.png](https://www.macphpstudy.com/image/index/main.png)
![02.png](https://www.macphpstudy.com/image/index/screen3.png)
![03.png](https://www.macphpstudy.com/image/index/screen4.png)
![04.png](https://www.macphpstudy.com/image/index/screen5.png)
![05.png](https://www.macphpstudy.com/image/index/screen6.png)

## 💽 Installation

1. [GitHub](https://github.com/xpf0000/PhpWebStudy/releases) provides the compiled stable version of the installation package

The latest version of the intel and Apple M installer has been separated, with arm64 for Apple M, without for intel, pay attention not to download the wrong one!

2. Installation with brew

```
brew install phpwebstudy
```

3. Of course you can also clone the code yourself to compile and package it.

## ⌨️ Development

### Cloning Code

```bash
git clone git@github.com:xpf0000/PhpWebStudy.git
```

### Install dependencies

```bash
cd PhpWebStudy
yarn install
```

### Run

```bash
yarn run dev
```

### Build

```bash
yarn run build
```

### PHP Versions

The brew libraries do not support older PHP versions, so if you want to use an older version of PHP, you need to use one of brew's third-party libraries.
Example:

[shivammathur/php](https://github.com/shivammathur/homebrew-php)

[phpbrew/phpbrew](https://github.com/phpbrew/phpbrew)

This application uses shivammathur/php, by default it will automatically add shivammathur/php libraries to the brew, but due to 'network problems', it may fail to add them.
You can add it by yourself, add command.

```
brew tap shivammathur/php
```

### PHP extensions

Current one-click installs include: ionCube memcache memcached redis swoole xdebug ssh2 pdo_sqlsrv imagick mongodb yaf sg11

For those that are not added to the one-click install, install them as follows and replace them with your own version of PHP.

```bash
cd extensions dir
/usr/local/Cellar/php@7.2.34/7.2.34/bin/phpize
./configure --with-php-config=/usr/local/Cellar/php@7.2.34/7.2.34/bin/php-config
make
make install
```


## 🛠 Technology Stacks

- [Electron](https://electronjs.org/)
- [vite](https://vitejs.dev/)
- [Vue3](https://v3.vuejs.org/)
- [Pinia](https://pinia.vuejs.org/)
- [Vue Router](https://router.vuejs.org/)
- [vue-i18n](https://github.com/intlify/vue-i18n-next)
- [Element-Plus](https://element-plus.org/en-US/)
- [Xterm](https://xtermjs.org)
- [node-pty](https://github.com/microsoft/node-pty)
- [monaco-editor](https://github.com/microsoft/monaco-editor)

## Contribution

We welcome you to join us in this project. Maybe you don't need a lot of skills, but a few simple things can make the project better.
Examples of things you can do include, but are not limited to:
- Testing, finding bugs, and filing issues.
- Translation, using your own language, to make software and website descriptions more accurate.
- Making product requirements and suggestions
- Designing better looking interfaces and icons
- Helping to share the software with a wider audience
- Write a blog, or record a video.
- Add features such as php extensions, software modules, common tools, etc.

Thank you to all the people who already contributed to PhpWebStudy!

## Feedback and Suggestions

Mention the Issues, or scan the code to add QQ group.

![QQqun.png](https://www.macphpstudy.com/image/index/qrcode0@2x.png)

## Sponsors

Do your best, do my best.

![wechat.png](https://www.macphpstudy.com/image/index/qrcode1@2x.png)

![alipay.png](https://www.macphpstudy.com/image/index/qrcode2@2x.png)

![ko-fi.png](https://www.macphpstudy.com/image/index/qrcode3@2x.png)

## 📜 License

[BSD 3-Clause License](https://github.com/xpf0000/PhpWebStudy/blob/master/LICENSE)

Copyright (c) 2023, xupengfei
