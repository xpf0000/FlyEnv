# PHP Debug With Xdebug

## Install PHP Xdebug extension

### macOS && Linux

FlyEnv provides the ability to quickly install xdebug extensions with just one click

<img src="https://oss.macphpstudy.com/image/2fdcb21372c6.png" data-x-image-preview="">
<p/>
<img src="https://oss.macphpstudy.com/image/6ed17cba5620.png" data-x-image-preview="">
<p />
<img src="https://oss.macphpstudy.com/image/e459c21168db.png" data-x-image-preview="">

### Windows

Currently, it is necessary to manually download xdebug.dll. Click 'Extension' button to open pecl sites and php extension folders

<img src="https://oss.macphpstudy.com/image/a4e9e0dd1b67.png" data-x-image-preview="">

Download the xdebug.dll file at [https://pecl.php.net/package/xdebug](https://pecl.php.net/package/xdebug) and put it in the php extension folder

## Configure xdebug in php.ini

FlyEnv provides a templates for quick configuration. Just click the copy button and paste the content into the php.ini file

<img src="https://oss.macphpstudy.com/image/a32559287475.png" data-x-image-preview="">
<p/>
<img src="https://oss.macphpstudy.com/image/f67b14ef9aa3.png" data-x-image-preview="">

```sh
[xdebug]
zend_extension = "xdebug.so"
xdebug.idekey = "PHPSTORM"
xdebug.client_host = localhost
xdebug.client_port = 9003
xdebug.mode = debug
xdebug.profiler_append = 0
xdebug.profiler_output_name = cachegrind.out.%p
xdebug.start_with_request = yes
xdebug.trigger_value=StartProfileForMe
xdebug.output_dir = /tmp
```

Save and restart PHP service

## Configure And User Xdebug In IDE

### PhpStorm

Set the PHP version used by PhpStorm

<img src="https://oss.macphpstudy.com/image/4b91c7af97cf.png" data-x-image-preview="">

Set the port for Xdebug

<img src="https://oss.macphpstudy.com/image/9b600b0b0275.png" data-x-image-preview="">

Set IDE key and Host

<img src="https://oss.macphpstudy.com/image/EFC867333484.jpg" data-x-image-preview="">

Start Linstening for XDebug connections

<img src="https://oss.macphpstudy.com/image/dad7b890d719.png" data-x-image-preview="">

Make the breakpoint. Then visit the site. PhpStorm will show this view

<img src="https://oss.macphpstudy.com/image/bc0823efa076.png" data-x-image-preview="">

Click 'Accept' button. PhpStorm will enter debugging mode

<img src="https://oss.macphpstudy.com/image/72ba6834f455.png" data-x-image-preview="">

### VSCode

There is a popular VSCode PHP extension called php debug. You can find it in the extension window and install it.

<img src="https://oss.macphpstudy.com/image/php-debug-package.png" data-x-image-preview="">

After installation, you must reload the VSCode window. Now, again run phpinfo(); method in any PHP file to check if Xdebug is enabled or not.

Now click on the debug console tab and click on add configuration.

<img src="https://oss.macphpstudy.com/image/configure-xdebug.png" data-x-image-preview="">

Now, you must select the environment which is PHP. VSCode will now add a launch.json file in the root directory.

<img src="https://oss.macphpstudy.com/image/launch-json.png" data-x-image-preview="">

Finally, add the runtimeExecutable property to the list after port:

```shell
"runtimeExecutable": "/usr/local/Cellar/php/8.3.11/bin/php"
```

Save the launch.json file. Open the debug mode tab, and click on the green debug button to start the debugging option.

<img src="https://oss.macphpstudy.com/image/vscode-xdebug.png" data-x-image-preview="">

You will now see few items in the window, through which you can select what logs Xdebugger will show

Navigate to the Debug Console section which shows you the details of errors and the debug execution buttons on top.

At this point, you can add breakpoints on the lines of code that you need to debug. Note that Xdebug will add the PHP debug script name with the line number on the bottom left section:

<img src="https://oss.macphpstudy.com/image/breakpoints-vscode.png" data-x-image-preview="">

You can run the application in the browser, and then read the code line by line, to see the errors and debug them properly. Also, you need to remind a few shortcut functions keys to move through functions and line of codes:

F5:  Continue Debugging

F10: Step Over

F11: Step into

Shift + F11: Step out

<img src="https://oss.macphpstudy.com/image/controls-xdebug.png" data-x-image-preview="">
