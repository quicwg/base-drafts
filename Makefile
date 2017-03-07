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
	  line=$$(cat "$$f" | sed -e 's/[|].*[|]//' | wc -L); \
	  if [ "$$line" -gt 80 ]; then \
	    echo "$$f contains a line with >80 ($$line) characters"; err=1; \
	  fi; \
	  figure=$$(sed -e '/^~~~/,/^~~~/p;d' "$$f" | wc -L); \
	  if [ "$$figure" -gt 69 ]; then \
	    echo "$$f contains a figure with >69 ($$figure) characters"; err=1; \
	  fi; \
	done; [ "$$err" -eq 0 ]
