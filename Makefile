MD_PREPROCESSOR := sed -e 's/{DATE}/$(shell date '+%Y-%m-%d')/g'

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

PYTHON := $(shell which python3)
ifeq ($(PYTHON),)
PYTHON := $(shell which python)
endif

ifneq ($(PYTHON),)
lint::
	@$(PYTHON) ./.lint.py draft-*.md
endif

show-next:
	@echo $(drafts_next)

PERL := $(shell which perl)
ifneq ($(PERL),)
MD_DRAFTS := $(wildcard draft-*.md)
tags:: $(MD_DRAFTS) .gen-tags.pl
	$(PERL) .gen-tags.pl $(MD_DRAFTS) > tags

clean::
	-rm -f tags
endif
