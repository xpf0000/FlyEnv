#!/bin/bash
cachedir=$1
phpdir=$2
version=$3
arch=$4
cd $cachedir
echo "downloading ssh2-$version.tgz from http://pecl.php.net/get/ssh2-$version.tgz"
curl -C - -O -L https://pecl.php.net/get/ssh2-$version.tgz
if [ -d "ssh2-$version" ]; then
 rm -rf "ssh2-$version"
fi
if [ -f "ssh2-$version.tgz" ]; then
  tar -zxf ssh2-$version.tgz
else
  exit 1
fi
echo "download success. start install"
export HOMEBREW_NO_AUTO_UPDATE=1
brew install pkg-config autoconf automake libtool
brew install libssh2
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
lib=$prefix/opt/libssh2
cd "ssh2-$version"
$phpdir/bin/phpize
./configure --with-ssh2=$lib --with-php-config=$phpdir/bin/php-config
make
make install
