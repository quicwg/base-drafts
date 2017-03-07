include lib/main.mk

lib/main.mk:
ifneq (,$(shell git submodule status lib 2>/dev/null))
	git submodule sync
	git submodule update --init
else
	git clone -q --depth 10 -b master https://github.com/martinthomson/i-d-template.git lib
endif

latest::
	@if grep -l ' $$' *.md; then ! echo "Trailing whitespace found"; fi
	@err=0; for f in draft-*.md ; do \
	  if grep -n '^.\{81\}' "$$f"; then \
	    echo "$$f contains a line with >80 characters"; err=1; \
	  fi; \
	  if cat "$$f" | (l=0; while read -r a; do l=$$(($$l + 1)); echo -E "$$l:$$a"; done) | \
	     sed -e '/^[0-9]*:~~~/,/^[0-9]*:~~~/p;d' | grep '^[0-9]*:.\{70\}'; then \
	    echo "$$f contains a figure with >69 characters"; err=1; \
	  fi; \
	done; [ "$$err" -eq 0 ]
