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

PERL := $(shell which perl)
ifneq ($(PERL),)
MD_DRAFTS := $(wildcard draft-*.md)
GEN_TAGS :=            'if (/^(\#+\s+.+?)\s+\{\#(.+?)}/) {'
GEN_TAGS := $(GEN_TAGS)'    $$re = quotemeta $$1;'
GEN_TAGS := $(GEN_TAGS)'    push @tags, "$$2\t$$ARGV\t/^$$re/\n";'
GEN_TAGS := $(GEN_TAGS)'}'
GEN_TAGS := $(GEN_TAGS)'END { print sort @tags }'
# Generate tags file for section anchors in the Markdown drafts.  This
# facilitates jumping to the section from the reference.
#
# (In vim, add the dash to the keyword definition via :set iskeyword+=-
# to be able to jump to anchors with dashes in them.)
tags:: $(MD_DRAFTS)
	$(PERL) -ne $(GEN_TAGS) $(MD_DRAFTS) > tags

clean::
	-rm -f tags
endif
