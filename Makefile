MD_PREPROCESSOR := sed -e 's/{DATE}/$(shell date '+%Y-%m-%d')/g'
TIDY := true

LIBDIR := lib
include $(LIBDIR)/main.mk

$(LIBDIR)/main.mk:
ifneq (,$(shell git submodule status $(LIBDIR) 2>/dev/null))
	git submodule sync
	git submodule update $(CLONE_ARGS) --init
else
	git clone -q --depth 10 $(CLONE_ARGS) \
	    -b mnot-334 https://github.com/martinthomson/i-d-template $(LIBDIR)
endif

latest:: lint
.PHONY: lint

lint::
	@$(python) ./.lint.py $(addsuffix .md,$(drafts))

show-next:
	@echo $(drafts_next)
