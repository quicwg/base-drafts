# Tag files for submission.
#
# You shouldn't need to use this unless you are tagging files for which you are
# not an author.  Use `git tag -a` instead.
#
# This script exists because
# https://trac.tools.ietf.org/tools/ietfdb/ticket/2390 still isn't fixed.

if [[ $# -eq 0 ]]; then
    files=(transport tls recovery http)
else
    files=("$@")
fi

enabled() {
    r="$1"; shift
    for e; do [[ "$e" == "$r" ]] && return 0; done
    return 1
}

tag() {
    message="Tag for $2 created by $(git config --get user.name)"
    git -c user.email="$1" tag -am "$message" "$2"
    git push origin "$2"
}

declare -A authors=( \
    [transport]=martin.thomson@gmail.com \
    [tls]=martin.thomson@gmail.com \
    [recovery]=ianswett@google.com \
    [http]=mbishop@evequefou.be \
    [invariants]=martin.thomson@gmail.com \
    [qpack]=afrind@fb.com \
    [spin-exp]=ietf@trammell.ch \
)

for t in $(make show-next); do
    r="${t%-[0-9][0-9]}"
    r="${r#draft-ietf-quic-}"
    if enabled "$r" "${files[@]}"; then
        tag "${authors[$r]}" "$t"
    fi
done
