# BuildPhp

<img src="https://raw.githubusercontent.com/xpf0000/BuildPhp/master/static/512x512.png" width="256" alt="App Icon" />

English | [简体中文](./README-CN.md)

## PHP and Web develop environment manager for Mac

[![GitHub release](https://img.shields.io/github/release/xpf0000/BuildPhp.svg)](https://github.com/xpf0000/BuildPhp/releases)  [![Total Downloads](https://img.shields.io/github/downloads/xpf0000/BuildPhp/total.svg)](https://github.com/xpf0000/BuildPhp/releases)

BuildPhp is a develop environment manager for Mac,include php,nginx,apache,msyql,memcached,redis and host manager
## ✨ Features

- Simple and clear user interface
- Version switching: select the corresponding version for development debugging according to the development needs
- Customized configuration of each software
- Log file immediate view
- Host manage
- Common PHP project URL rewriting one-click settings
- Ease generation of SSL self signed certificate

## 💽 Installation

Download from [GitHub](https://github.com/xpf0000/BuildPhp/releases) Releases and install it.

## 🖥 User Interface

![scan.png](https://raw.githubusercontent.com/xpf0000/BuildPhp/master/screenshots/scan.jpg)
![screen1.gif](https://raw.githubusercontent.com/xpf0000/BuildPhp/master/screenshots/screen1.gif)
![screen2.gif](https://raw.githubusercontent.com/xpf0000/BuildPhp/master/screenshots/screen2.gif)
![screen3.gif](https://raw.githubusercontent.com/xpf0000/BuildPhp/master/screenshots/screen3.gif)

## ⌨️ Development

### Clone Code

```bash
git clone git@github.com:xpf0000/BuildPhp.git
```

### Install Dependencies

```bash
cd BuildPhp
npm install
```
If you like [Yarn](https://yarnpkg.com/), you can also use yarn to install dependencies.

### Dev Mode

```bash
npm run dev
```

### Build Release

```bash
npm run build
```

After building, the application will be found in the project's release directory.

### Mysql Initial account and password

Mysql Initial account and password is root root, you can use phpmyadmin or other db tool to use it

### PHP Extensions

now one click installation include ionCube memcache memcached redis swoole

Feedback will be collected and added to one click installation

If it is not added to one click installation, use the following method to install and replace it with your own PHP version

```bash
CD extension directory

/usr/local/Cellar/ php@7.2.34/7.2.34/bin/phpize

./configure --with-php-config=/usr/local/Cellar/ php@7.2.34/7.2.34/bin/php-config

make

make install
```

## 🛠 Technology Stack

- [Electron](https://electronjs.org/)
- [Vue](https://vuejs.org/) + [VueX](https://vuex.vuejs.org/) + [Element](https://element.eleme.io)

## 🤝 Contribute [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](http://makeapullrequest.com)

If you are interested in participating in joint development, PR and Forks are welcome!

## 📜 License

Open source based on [MIT](https://opensource.org/licenses/mit) license
