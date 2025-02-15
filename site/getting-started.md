# Getting Started

## Installation

### macOS

Installation with Homebrew

::: code-group

```zsh
brew update && brew install flyenv
```

:::

Download install

| Arch         | File                | GitHub Release |   百度网盘   |
|:-------------|:--------------------|:--------------:|:--------:|
| Intel X86_64 | {version}.dmg       |  [download](https://github.com/xpf0000/FlyEnv/releases/latest)  | [download](https://pan.baidu.com/s/1tqHN9piZVVuTyTD3FXI71A?pwd=mnb4) |
| Apple Silicon | {version}-arm64.dmg | [download](https://github.com/xpf0000/FlyEnv/releases/latest) |  [download](https://pan.baidu.com/s/1tqHN9piZVVuTyTD3FXI71A?pwd=mnb4)  |

If you only need a simple PHP service and web service, you can also take a look at FlyEnv's derivative products: [FlyPHPServer](/flyphpserver),  Already listed on [Mac App Store](https://apps.apple.com/us/app/flyphpserver/id1506384441), available for direct download and use

### Windows

Download install. Currently only supports x86_64

| Arch         | File                  | GitHub Release |   百度网盘   |
|:-------------|:----------------------|:--------------:|:--------:|
| X86_64 | {version}-Windows.zip |  [download](https://github.com/xpf0000/FlyEnv/releases/latest)  | [download](https://pan.baidu.com/s/1tqHN9piZVVuTyTD3FXI71A?pwd=mnb4) |

### Linux

Download install. Supports Debin / Ubuntu / Red Hat / Fedora / SUSE / CentOS. x86_64 And arm64

| Arch                             | File                  | GitHub Release |   百度网盘   |
|:---------------------------------|:----------------------|:--------------:|:--------:|
| Debin/Ubuntu x86_64              | {version}_amd64.deb   |  [download](https://github.com/xpf0000/FlyEnv/releases/latest)  | [download](https://pan.baidu.com/s/1tqHN9piZVVuTyTD3FXI71A?pwd=mnb4) |
| Red Hat/Fedora/SUSE/CentOS x86_64   | {version}.x86_64.rpm  | [download](https://github.com/xpf0000/FlyEnv/releases/latest) |  [download](https://pan.baidu.com/s/1tqHN9piZVVuTyTD3FXI71A?pwd=mnb4)  |
| Debin/Ubuntu arm64               | {version}_arm64.deb   |  [download](https://github.com/xpf0000/FlyEnv/releases/latest)  | [download](https://pan.baidu.com/s/1tqHN9piZVVuTyTD3FXI71A?pwd=mnb4) |
| Red Hat/Fedora/SUSE/CentOS arm64 | {version}.aarch64.rpm | [download](https://github.com/xpf0000/FlyEnv/releases/latest) |  [download](https://pan.baidu.com/s/1tqHN9piZVVuTyTD3FXI71A?pwd=mnb4)  |

## Befor Running

### macOS

Most services of FlyEnv are installed using Homebrew or Macports. So before starting, you need to install Homebrew or Macports first. You can follow this link to install them.

[Homebrew](https://brew.sh/)

[Macports](https://www.macports.org/install.php)

[Homebrew install for China user](https://gitee.com/cunkai/HomebrewCN)

### Linux

It is recommended to install Homebrew. You can also install all services using the apt/dnf that comes with the system, but some services from the system default sources only have older versions.

[Homebrew](https://brew.sh/)

## Up and Running

Open FlyEnv.

1. Install version in FlyEnv service's 'Version Manager' panel. Or install it in terminal. FlyEnv will automatically search for installed services
2. Create a site. Or create a demo site using FlyEnv’s bot on bottom right corner
3. Start service in FlyEnv service's 'Service' panel.
4. Click the site link in the FlyEnv Host panel and open it in the browser

## Uninstall

Use the default uninstallation method of each platform to uninstall

The application folder and data folder of FlyEnv are independent. The default uninstallation method does not delete the data folder. When using third-party tools (such as CleanMyMac, etc.) to uninstall, some will select the data folder by default. If you want to keep the data folder, be careful not to check it

The data folder on each platform:

- macOS

```sh
~/Library/PhpWebStudy
```

- Windows

Same folder with where FlyEnv installed. The data folder name is 'PhpWebStudy-Data'

- Linux

```sh
~/.config/PhpWebStudy
```
