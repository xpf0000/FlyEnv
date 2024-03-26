#!/bin/bash
cachedir=$1
phpdir=$2
memcachev=$3
arch=$4
cd $cachedir
echo "downloading memcache-$memcachev.tgz from http://pecl.php.net/get/memcache-$memcachev.tgz"
curl -C - -O -L http://pecl.php.net/get/memcache-$memcachev.tgz
if [ -d "memcache-$memcachev" ]; then
 rm -rf "memcache-$memcachev"
fi
if [ -f "memcache-$memcachev.tgz" ]; then
  tar -zxf memcache-$memcachev.tgz
else
  exit 1
fi
echo "download success. start install"
export HOMEBREW_NO_AUTO_UPDATE=1
arch $arch brew install pkg-config autoconf automake libtool
arch $arch brew install zlib
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
zlib=$prefix/opt/zlib
cd "memcache-$memcachev"
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config --with-zlib-dir=$zlib
make
make install
