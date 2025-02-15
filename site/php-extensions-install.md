# PHP Extensions Install

## macOS & Linux

FlyEnv provides quick installation of php extensions

<img src="https://oss.macphpstudy.com/image/4e4fab8b6a43.png" data-x-image-preview="">
<p/>
<img src="https://oss.macphpstudy.com/image/f05dd95d81fc.png" data-x-image-preview="">

You can also use the pecl command to install php extensions

Click or copy the path. cd to the path in the terminal

<img src="https://oss.macphpstudy.com/image/c462e1c31e6.png" data-x-image-preview="">

Install php xdebug extension

```sh
./bin/pecl install xdebug
```

<img src="https://oss.macphpstudy.com/image/eb4e7fd0e2fd.png" data-x-image-preview="">

## Windows

Currently no quick installation is provided. But it provides the ability to open pecl sites and php extension folders

Note. The extensions folder contains most common extensions by default. PHP does not enable these extensions by default. Please enable them in php.ini.

<img src="https://oss.macphpstudy.com/image/a4e9e0dd1b67.png" data-x-image-preview="">

Download the .dll file at [https://pecl.php.net/packages.php](https://pecl.php.net/packages.php) and put it in the php extension folder

The Windows version of PHP extension quick installation is very simple to implement. But the corresponding relationship between the php version and the php extension version is too cumbersome. I don't have much time to deal with this.

If anyone wants to contribute. You can fork the code and submit a PR. Or provide the correspondence between the php version and the php extension version







