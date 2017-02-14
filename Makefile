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
	@wc -L draft-*.md | head -n -1 | while read l f; do \
	  [ "$$l" -le 80 ] || ! echo "$$f is contains a line with $$l characters"; \
	done
