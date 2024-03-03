# PhpWebStudy

<img src="https://raw.githubusercontent.com/xpf0000/PhpWebStudy/master/build/256x256.png" width="256" alt="App Icon" />

## Powerful Web and PHP Development Environment for macOS

[![GitHub release](https://img.shields.io/github/release/xpf0000/PhpWebStudy.svg)](https://github.com/xpf0000/PhpWebStudy/releases)  [![Total Downloads](https://img.shields.io/github/downloads/xpf0000/PhpWebStudy/total.svg)](https://github.com/xpf0000/PhpWebStudy/releases)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/R5R2OJXTM)

PhpWebStudy is an all-in-one software designed to revolutionize the way you develop and test websites locally. With its advanced features and sleek design, PhpWebStudy allows you to effortlessly create a local web server and access your websites using domain names. Say goodbye to tedious configurations and hello to streamlined web development.

Key Features:

1. Local Web Server: PhpWebStudy sets up a powerful local web server, enabling you to work on your websites without an internet connection. It acts as a standalone environment, providing an efficient and secure platform for your web development projects.

2. Domain Name Integration: Access your local websites using domain names, making it easier than ever to migrate your projects from development to production. No more convoluted URLs or IP addresses – simply assign unique domain names to ensure a seamless transition.

3. Support for Major Technologies: PhpWebStudy supports a wide range of technologies essential for web development. It includes PHP, MySQL, NGINX, Apache, MariaDB, MongoDB, PostgreSQL, Memcached, Redis, and Pure-FTP, ensuring compatibility with most web applications and frameworks.

4. Beautiful Interface: PhpWebStudy boasts a visually stunning and intuitive user interface, offering an exceptional user experience

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

![theme-white.png](https://www.macphpstudy.com/image/index/theme-white.png)
![theme-white-min.png](https://www.macphpstudy.com/image/index/theme-white-min.png)
![theme-black.png](https://www.macphpstudy.com/image/index/theme-black.png)
![theme-black-min.png](https://www.macphpstudy.com/image/index/theme-black-min.png)


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

## 📜 License

[BSD 3-Clause License](https://github.com/xpf0000/PhpWebStudy/blob/master/LICENSE)
