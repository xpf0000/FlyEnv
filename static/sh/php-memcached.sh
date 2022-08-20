#!/bin/bash
cachedir=$1
phpdir=$2
memcachedv=$3
arch=$4
cd $cachedir
curl -C - -O -s http://pecl.php.net/get/memcached-$memcachedv.tgz
if [ -d "memcached-$memcachedv" ]; then
 rm -rf "memcached-$memcachedv"
fi
if [ -f "memcached-$memcachedv.tgz" ]; then
  tar -zxf memcached-$memcachedv.tgz
else
  exit 1
fi
prefix=$(brew --prefix)
zlib=$prefix/opt/zlib
lib=$prefix/opt/libmemcached
if [ ! -d $lib ]; then
  arch $arch brew install libmemcached
fi
cd "memcached-$memcachedv"
cellar=$(brew --Cellar)
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config --with-libmemcached-dir=$lib --with-zlib-dir=$zlib
make
make install
