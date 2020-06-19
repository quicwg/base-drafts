MD_PREPROCESSOR := sed -e 's/{DATE}/$(shell date '+%Y-%m-%d')/g'

LIBDIR := lib
include $(LIBDIR)/main.mk

$(LIBDIR)/main.mk:
ifneq (,$(shell git submodule status $(LIBDIR) 2>/dev/null))
	git submodule sync
	git submodule update $(CLONE_ARGS) --init
else
	git clone -q --depth 10 $(CLONE_ARGS) \
	    -b action https://github.com/martinthomson/i-d-template $(LIBDIR)
endif

latest:: lint
.PHONY: lint

PYTHON := $(shell which python3)
ifeq ($(PYTHON),)
PYTHON := $(shell which python)
endif

ifneq ($(PYTHON),)
lint::
	@$(PYTHON) ./.lint.py $(addsuffix .md,$(drafts))
endif

show-next:
	@echo $(drafts_next)
