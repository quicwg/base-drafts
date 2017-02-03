include lib/main.mk

lib/main.mk:
ifneq (,$(shell git submodule status lib 2>/dev/null))
	git submodule sync
	git submodule update --init
else
	git clone -q --depth 10 -b save_issues https://github.com/martinthomson/i-d-template.git lib
endif

latest::
	@if grep -l ' $$' *.md; then ! echo "Trailing whitespace found"; fi
