#!/bin/bash
cachedir=$1
projectdir=$2
frameworkname=$3
version=$4
cd "$cachedir" || exit 1
if [ -f "composer.phar" ]; then
  chmod 777 composer.phar
  ./composer.phar self-update
else
  curl -sS https://getcomposer.org/installer | php
  chmod 777 composer.phar
fi

if [ ! -f "composer.phar" ]; then
  exit 1
fi

cd "$projectdir" || exit 1
"$cachedir"/composer.phar create-project --prefer-dist "$frameworkname" "phpwebstudy-create-project" "$version"
cd phpwebstudy-create-project || exit 1
mv ./* ../
cd ../
rm -rf phpwebstudy-create-project

