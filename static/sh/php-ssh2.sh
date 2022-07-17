#!/bin/bash
cachedir=$1
phpdir=$2
version=$3
cd $cachedir
curl -C - -O -s https://pecl.php.net/get/ssh2-$version.tgz
if [ -d "ssh2-$version" ]; then
 rm -rf "ssh2-$version"
fi
if [ -f "ssh2-$version.tgz" ]; then
  tar -zxf ssh2-$version.tgz
else
  exit 1
fi
prefix=$(brew --prefix)
lib=$prefix/opt/libssh2
if [ ! -d $lib ]; then
  brew install libssh2
fi
cd "ssh2-$version"
$phpdir/bin/phpize
./configure --with-ssh2=$lib --with-php-config=$phpdir/bin/php-config
make
make install
