# Security issue in FlyEnv, local privilege escalation to root via flyenv-helper

Hi Alex,

I've been using FlyEnv-4.18.3 (also checked in FlyEnv-4.19.1-x64) on Ubuntu 26.06-LTS & Ubuntu 24.04.5 LTS in a VM and while poking around the helper I ran into a privilege-escalation problem I think you'll want to look at sooner rather than later. The short version: any code running as the local user that runs FlyEnv can turn itself into root through flyenv-helper.

When the helper gets installed it runs as a root systemd service and listens on
a Unix socket. That part is fine. But one of the privileged methods, runScript, takes
a script path and runs it as root. It checks that the file is named start-*.sh, but it
never checks who owns the file or whether a normal user can write to it. And one of
those allowed folders is the FlyEnv data directory (~/.config/FlyEnv), which the user
obviously owns and can write to.

So the whole thing collapses into this: I drop my own start-whatever.sh into
~/.config/FlyEnv, I ask the helper to runScript it, and root executes my script.
I've attached a screenshot of my PoC doing exactly that: a normal user going
straight to uid=0(root).

The one thing that's supposed to gate this is the HMAC signature, but the
installer chowns the signing key to the desktop user (0600, but owned by that same
user), so I can just read it and sign my own requests.

I do want to be fair about the blast radius, because it's easy to overstate this:
it is NOT "any local user becomes root". The socket and the key are 0600 owned by
the FlyEnv user, and the helper verifies the caller's uid over the socket, so a different
local user can't reach it. I tested this both ways and the isolation holds. What it really is:
the user who runs FlyEnv can escalate to root. That still matters a lot, because it means
anything that ends up running code as that user, a malicious project you open in the app,
a poisoned dependency, a bug in the renderer, plain local malware, gets a path to root.

I've kept the step-by-step reproduction out of this email on purpose, but I have a full
PoC and notes ready. If you need more details to pin it down or fix it, just ask and I'll
send over whatever helps you most.

I'm in no rush to publish anything. I'm happy to hold off on any public write-up until
you've had time to ship a fix, and to test a patch for you on the same setup. Just let me
know what timeline works.

Thanks for FlyEnv, honestly, it's a genuinely useful tool and I'd rather see this
quietly fixed.

Best,
Sergio | @sd0lv
