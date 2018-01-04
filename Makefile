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

.PHONY: lint
lint:: $(addprefix .,$(addsuffix .lint,$(drafts)))

.%.lint: %.md
	@err=0; \
	if cat "$<" | (l=0; while read -r a; do l=$$(($$l + 1)); echo -E "$$l:$$a"; done) | \
	   sed -e '1,/--- abstract/d;/^[0-9]*: *|/d' | tr -d '\r' | grep '^[0-9]*:.\{81\}'; then \
	  echo "$< contains a line with >80 characters"; err=1; \
	fi; \
	if cat "$<" | (l=0; while read -r a; do l=$$(($$l + 1)); echo -E "$$l:$$a"; done) | \
	   sed -e '/^[0-9]*:~~~/,/^[0-9]*:~~~/p;/^[0-9]*:```/,/^[0-9]*:```/p;d' | \
	   tr -d '\r' | grep '^[0-9]*:.\{66\}'; then \
	  echo "$< contains a figure with >65 characters"; err=1; \
	fi; \
	[ "$$err" -eq 0 ] && touch $@
