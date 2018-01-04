MD_PREPROCESSOR := sed -e 's/{DATE}/$(shell date '+%Y-%m')/g'

LIBDIR := lib
include $(LIBDIR)/main.mk

$(LIBDIR)/main.mk:
ifneq (,$(shell git submodule status $(LIBDIR) 2>/dev/null))
	git submodule sync
	git submodule update $(CLONE_ARGS) --init
else
	git clone -q --depth 10 $(CLONE_ARGS) \
	    -b master https://github.com/martinthomson/i-d-template $(LIBDIR)
endif

latest:: lint
.PHONY: lint

PYTHON := $(or $(shell which python3),$(shell which python))

lint::
	@$(PYTHON) ./.lint.py draft-*.md
