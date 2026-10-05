# GitHub CLI on this computer

The user said to always use /home/tnfssc/.config/gh-headless for gh on this computer. Set GH_CONFIG_DIR to that path. Fish has an exported universal GH_CONFIG_DIR variable, so future shells use it by default. Pass GH_CONFIG_DIR explicitly when launching gh outside Fish or from an older process.

The normal login keyring is locked and can make gh hang over SSH. The headless config is authenticated as tnfssc and stores its OAuth token unencrypted locally, with the user's knowledge. Never print, commit, or paste the token. No global DBUS_SESSION_BUS_ADDRESS override is needed after login; do not break other apps' keyring access.

Git SSH works even though the unused id_rsa key warns about unsupported libcrypto. Do not treat that warning as a failed push; read the exit code and remote result.
