# Host

## Host Name

It can be any domain name. But try not to use .local/.dev. because some users have submitted issues. These two types of domain names may cause DNS resolution issues. Causing slow access

The subdomain will automatically collapse to the main domain name. When you have many sites. Use appropriate subdomains and main domains. It will make the list cleaner

## Host Alias

Another host name.

## Host Root Path

The root directory of the site. Usually it is a project folder. If a PHP framework is used (such as Laravel/yii2/hintphp, etc.), it is usually in the public folder

The directory must have the correct permissions. The user/group/read-write permissions must be correct. Usually, as long as it is not a system folder, such as /bin | /etc | c:/windows, there is usually no problem

## Park

Batch create sites based on host name and sub directory name in host root path. The final website domain name is {sub directory name}.{host name}

## PHP Version

Which PHP Version does this site use. Or set site to Static Site

## Port

Which port does this site use for http.

The default is 80, and when using HTTP access, there is no need to carry a port number. Non 80 port, requires port number to access, like: [http://www.test.com:8080/](#Port)

## SSL

Use or not use ssl. Allow use https access site when use ssl.

### Auto SSL Certificates

Automatically generate SSL certificate based on host name and host alias.

[Note] In Linux, browsers such as Chrome and Firefox cannot automatically trust the generated root CA certificate You also need to manually import the root CA certificate in the browser settings

## Nginx Url Rewrite

Set nginx URL rewrite rules for the project.

FlyEnv has built-in default nginx URL rewrite rules for popular PHP frameworks. Just click to select and use

