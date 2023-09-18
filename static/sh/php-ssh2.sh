#!/bin/bash
cachedir=$1
phpdir=$2
version=$3
arch=$4
cd $cachedir
curl -C - -O -L -s https://pecl.php.net/get/ssh2-$version.tgz
if [ -d "ssh2-$version" ]; then
 rm -rf "ssh2-$version"
fi
if [ -f "ssh2-$version.tgz" ]; then
  tar -zxf ssh2-$version.tgz
else
  exit 1
fi
export HOMEBREW_NO_AUTO_UPDATE=1
arch $arch brew install pkg-config autoconf automake libtool
arch $arch brew install libssh2
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
lib=$prefix/opt/libssh2
cd "ssh2-$version"
$phpdir/bin/phpize
./configure --with-ssh2=$lib --with-php-config=$phpdir/bin/php-config
make
make install
