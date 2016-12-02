MD_PREPROCESSOR := sed -e 's/{DATE}/$(shell date +%Y-%m)/'
USE_XSLT := true

include lib/main.mk

lib/main.mk:
ifneq (,$(shell git submodule status lib 2>/dev/null))
	git submodule sync
	git submodule update --init
else
	git clone -q --depth 10 -b master https://github.com/martinthomson/i-d-template.git lib
endif
