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

CURRENT_BRANCH := $(shell git rev-parse --abbrev-ref HEAD)
LINT_DIR := .lintcache/$(CURRENT_BRANCH)

lint_files:= $(addprefix $(LINT_DIR)/,$(addsuffix .lint,$(drafts)))

latest:: lint
lint:: lint-purge $(lint_files)

.PHONY: lint lint-purge

$(LINT_DIR)::
	@mkdir -p $(LINT_DIR)

$(LINT_DIR)/%.lint: %.md $(LINT_DIR)
	@hash=`git hash-object "$<"`; \
	if [ -r "$@" ] && [ "`cat '$@'`" == "$$hash" ]; then \
		touch "$@"; \
		echo "Reused lint of $<"; \
	else \
		for draft_lint in $(LINT_DIR)/*.lint; do \
			if ["$$draft_lint" != "$@" ] && \
			 [ -r "$$draft_lint" ] && [ "`cat "$$draft_lint"`" == "$$hash" ]; then \
				cp "$$draft_lint" "$@"; \
				echo "Reused lint from $$draft_lint"; \
			fi; \
		done; \
		if [ ! -r "$@" ] || [ "`cat "$@"`" != "$$hash" ]; then \
			for branch in `git branch --points-at HEAD`; do \
				old_lintfile=".lintcache/$$branch/$(@F)"; \
				if [ -r "$$old_lintfile" ]; then \
					cp "$$old_lintfile" "$@"; \
					echo "Reused lint of $< from $$branch"; \
					break; \
				fi; \
			done; \
			if [ ! -r "$@" ] || [ "`cat "$@"`" != "$$hash" ]; then \
				echo "Linting $<..."; \
				localerr=0 \
				f="$<"; \
				if cat "$<" | (l=0; while read -r a; do l=$$(($$l + 1)); echo -E "$$l:$$a"; done) | \
					sed -e '1,/--- abstract/d;/^[0-9]*: *|/d' | tr -d '\r' | grep '^[0-9]*:.\{81\}'; then \
					echo "$< contains a line with >80 characters"; err=1; \
				fi; \
				if cat "$<" | (l=0; while read -r a; do l=$$(($$l + 1)); echo -E "$$l:$$a"; done) | \
					sed -e '/^[0-9]*:~~~/,/^[0-9]*:~~~/p;/^[0-9]*:```/,/^[0-9]*:```/p;d' | \
					tr -d '\r' | grep '^[0-9]*:.\{66\}'; then \
					echo "$< contains a figure with >65 characters"; err=1; \
				fi; \
				if [ "$$localerr" -eq 1 ]; then false; \
				else \
					echo "$$hash" > "$@"; \
				fi; \
			fi; \
		fi; \
	fi;

lint-purge:: $(LINT_DIR)
	@MAYBE_OBSOLETE=`comm -13 <(git branch | sed -e 's,.*[ /],,' | sort | uniq) <(ls ".lintcache" | sed -e 's,.*/,,')`; \
	for item in $$MAYBE_OBSOLETE; do \
			rm -rf ".lintcache/$$item"; \
	done; \
	for item in $(filter-out $(lint_files),$(wildcard $(LINT_DIR)/*.lint)); do \
		rm $$item; \
	done
