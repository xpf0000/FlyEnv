# OpenSearch

## Local TLS with FlyEnv certificates

Stop OpenSearch, then open **Configuration → opensearch.yml → Common → Local TLS certificates**.
The default CA is `<FlyEnv server directory>/CA/FlyEnv-Root-CA.crt` with its matching `.key`.
You can also select a CA created by FlyEnv's SSL certificate tool, or mkcert's
`rootCA.pem` and `rootCA-key.pem`. The CA must use an unencrypted RSA private key.

**Generate and configure TLS** signs separate node and administrator certificates.
Node certificates cover `localhost`, the computer hostname, `127.0.0.1` and `::1`,
and support both server and client authentication. Private keys use PKCS#8.
Files are written under `config/flyenv-tls/<generation>/`; OpenSearch receives
relative paths. The CA private key remains at its original location.
The previous `opensearch.yml` is backed up beside the configuration file.
Start OpenSearch after configuration and connect using `https://localhost:9200`
(or your configured HTTP port). Clients must trust the selected CA certificate.

The operation enables the security plugin and HTTPS. It preserves existing
administrator/node DNs and user/role data. It does not change login passwords
or initialize the security index. Custom JKS/PFX or split transport TLS setups
must be configured manually; the automatic operation accepts flat
`plugins.security.*` YAML keys.

## First security initialization

A new cluster can start with TLS while returning **OpenSearch Security not
initialized** to regular requests. Open the generated certificate directory to
find `admin.pem`, `admin-key.pem` and `root-ca.pem`.

For a **new security index**, prepare the files in `config/opensearch-security`
including your own administrator password hash (`plugins/opensearch-security/tools/hash.bat`
on Windows), then use the bundled `securityadmin.bat`/`securityadmin.sh` with
`-cacert`, `-cert` and `-key` pointing to these generated files, `-h localhost`,
your HTTP `-p`, and `-cd` pointing to the prepared security configuration directory.
Applying an entire directory also replaces its users and roles, so this is a
separate administrator action rather than an automatic certificate setup step.
Use the administrator certificate only for administration, not as a regular
application credential.

See the official [certificate requirements](https://docs.opensearch.org/latest/security/configuration/generate-certificates/),
[TLS configuration](https://docs.opensearch.org/latest/security/configuration/tls/), and
[securityadmin documentation](https://docs.opensearch.org/latest/security/configuration/security-admin/).
