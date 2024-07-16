#!/bin/bash
cachedir=$1
phpdir=$2
memcachedv=$3
arch=$4
cd $cachedir
echo "downloading memcached-$memcachedv.tgz from http://pecl.php.net/get/memcached-$memcachedv.tgz"
curl -C - -O -L http://pecl.php.net/get/memcached-$memcachedv.tgz
if [ -d "memcached-$memcachedv" ]; then
 rm -rf "memcached-$memcachedv"
fi
if [ -f "memcached-$memcachedv.tgz" ]; then
  tar -zxf memcached-$memcachedv.tgz
else
  exit 1
fi
echo "download success. start install"
export HOMEBREW_NO_AUTO_UPDATE=1
brew install pkg-config autoconf automake libtool
brew install zlib
brew install libmemcached
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
zlib=$prefix/opt/zlib
lib=$prefix/opt/libmemcached
cd "memcached-$memcachedv"
cellar=$(brew --Cellar)
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config --with-libmemcached-dir=$lib --with-zlib-dir=$zlib
make
make install
