# Loaded through BASH_ENV by every non-interactive bash the update scripts start. Git Bash puts its own
# /mingw64/bin ahead of the inherited PATH, so a function is the only reliable way to route curl to the
# controlled origin without editing the scripts under test.
curl() { "${RUNLY_TEST_BIN:?}/curl" "$@"; }
