# Tag files for submission.
#
# You shouldn't need to use this unless you are tagging files for which you are
# not an author.  Use `git tag -a` instead.
#
# This script exists because
# https://trac.tools.ietf.org/tools/ietfdb/ticket/2390 still isn't fixed.

if [[ $# -eq 0 ]]; then
    files=(transport tls recovery http qpack)
else
    files=("$@")
fi

enabled() {
    r="$1"; shift
    for e; do [[ "$e" == "$r" ]] && return 0; done
    return 1
}

declare -A authors=( \
    [transport]=mt@lowentropy.net \
    [tls]=mt@lowentropy.net \
    [recovery]=ianswett@google.com \
    [http]=mbishop@evequefou.be \
    [invariants]=mt@lowentropy.net \
    [qpack]=afrind@fb.com \
    [spin-exp]=ietf@trammell.ch \
)

if ! make; then
    echo "FAILED TO BUILD STOP" 1>&2
    exit 1
fi

all=($(make show-next))
tags=()
thisuser=$(git config --get user.name)

for t in "${all[@]}"; do
    r="${t%-[0-9][0-9]}"
    r="${r#draft-ietf-quic-}"
    if enabled "$r" "${files[@]}"; then
        message="Tag for $t created by $thisuser"
        git -c user.email="${authors[$r]}" tag -am "$message" "$t"
	tags+=("$t")
    fi
done
for t in "${tags[@]}"; do
    git push origin "$t"
done
