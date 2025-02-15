# What is FlyEnv?

FlyEnv is a GUI application that integrates web server/database server/development environment management

In short, FlyEnv provides a complete operating environment. Assist users in developing and debugging PHP/NodeJS/Java/GO/Python programs,
such as Laravel/WordPress/yii2/hintphp/Fastadmin/TestJS/SpringBoot/Gin/Beego/Django/Flash...

## Main functions

### Software installation

Provided One click installation function for software such as web server, database, programming language, data queue&cache, DNS servers, FTP servers and email servers

Web server support: Apache, Caddy, Nginx, Tomcat,  Static Document Server

Database support: MySQL, MariaDB, PostgreSQL, MongoDB

Programming language support: PHP, Java, NodeJS, Python, Go, Erlang

Data queue&cache support: Redis, RabbitMQ, Memcached

Email server support: Mailpit

All software provides multi version installation, such as PHP supporting installation from version 5. x to the latest version 8. x.
MySQL supports installation of versions 5. x to 9. x.
And once a new version is available, it will automatically become available.
No need to wait for FlyEnv upgrade updates

For the Windows version The software's official provides installation packages, and all software is downloaded from the official source

For the macOS version, because most software does not have an installation package that can be downloaded and run directly.
FlyEnv offers three installation methods:

1. If the software's official provides installation packages that can be downloaded and run directly, download them from the official website
2. Install using Homebrew
3. Install using Macports

For users who have already installed software locally, FlyEnv provides the function of adding software custom paths,
which allows user to add installed software without downloading again.
MacOS will also automatically search for installed software on Homebrew and Macports, without the need for repeated installation

### Management software services

All software that needs to run services can manage the running and stopping of software services in FlyEnv

For example, you can start the PHP-FPM service for PHP. You can also start the MySQL service, Apache services, Redis services, etc

All services support configuration files, FlyEnv has a built-in editor that allows for quick modification of configuration files.
It also supports automatically opening folders and locating them to the configuration file location

### Local website

One click quick creation of local site. FlyEnv will automatically generate site configuration files for web servers such as Apache, Caddy, Nginx, Tomcat, etc.
Support accessing local sites with any domain name. Also supports HTTPS access

Using the built-in editor, users can quickly edit site configuration files.
It also supports setting and editing site configuration templates. The site access logs are also easy to view

### Environment variable settings

All software supported within FlyEnv can be added to environment variables with just one click.
You can also set aliases, such as PHP74, PHP82, etc. Convenient for users to use on the terminal

## Other functions

In addition to the main functions listed above, FlyEnv also provides developers with many practical features. There are too many functions, let you discover them. Here are just a few commonly used examples

1. JSON parsing
   JSON, JavaScript objects or arrays, PHP Array, XML, YAML, PList, TOML, Go Struct, Go Bson, Rust Serde, Java, Kotlin, SQL, JSDoc mutual parsing and conversion

2. Port killing and process killing
   Search and kill processes using process commands or the port number used

3. Create a new project
   One click quick creation of Laravel, WordPress, Yii2, Next.js, Remix, Vue, NestJS... projects

## Differences from Docker

Docker is indeed very good. But there are also many people who just want an out-of-the-box PHP/NodeJS/Java/Go/Python applications running environment.

Compared to Docker, FlyEnv is more intuitive and ready-to-use. FlyEnv does not use virtual containers, it is a native application. All modules run as native static binaries, which is faster and consumes fewer resources(Especially on macOS and Windows). Configuration files and log files are also easier to view and modify.

## Differences from MAMP Pro/Laravel Herd/XAMPP...

Compared with other applications, FlyEnv is more flexible. FlyEnv itself implements a set of service running framework.
Internal services can be from any source. Homebrew / Macports / APT / DNF / official static binary / third-party static binary... Version update will be more timely.
Unlike some Apps, you can only use some outdated versions unless you wait for App updates.

The running settings and configuration files of each service of FlyEnv are also closer to the real production deployment environment.
They can be easily applied to the production environment.

## Other

FlyEnv contains a wide range of functional modules.
But a person may only use a few modules inside.
In the settings, unnecessary modules can be hidden. If there is a need to reopen it later

FlyEnv provides many installation methods for software.
However, some regions may be limited by network issues and unable to install or have slow installation speeds.
In this case, not all software may be installed using FlyEnv
Users can install software in any way they want, add custom version paths in FlyEnv, and then these software can use by FlyEnv

The configuration files of many FlyEnv services used. It is basically a general configuration and has not been set for specific projects.
For example, Apache's default enabled modules, PHP default loaded extensions, etc
If certain projects cannot run properly during use and require specific modules or extensions, please submit GitHub Issues or leave me a message.
After confirming this information, optimization will be carried out

Many services within FlyEnv were not extensively utilized during development, only ensuring basic functionality.
Deep users of these features are welcome to provide suggestions

I believe that with the help of the community, FlyEnv will continue to improve, with more software support, more user-friendly tools, and faster running speeds
It can also make it easier for developers to work, spend more time with their families, and achieve their life goals as soon as possible
