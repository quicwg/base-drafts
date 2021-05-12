#!/usr/bin/env python3
# Tidy an xml2rfc file.
#
# This:
# * removes non-semantic content (comments, processing instructions, DOCTYPE
#   declarations, broken entity references)
# * wraps BCP 14 language in <bcp14> elements
# * indents elements neatly

import sys
import xml.sax
import re
from xml.sax.saxutils import escape, quoteattr


class Tidy(xml.sax.handler.ContentHandler):
    pattern = re.compile(
        r"\b((?:(?:MUST|SHOULD|SHALL)(?:\s+NOT)?)|(?:(?:NOT\s+)?RECOMMENDED)|MAY|OPTIONAL|REQUIRED)\b"
    )

    def __init__(self):
        self.tags = []
        self.nesting = 0
        self.c = ""
        self.state = ""

    def startDocument(self):
        print('<?xml version="1.0" encoding="UTF-8"?>')

    def preserve(tag):
        return tag in ["artwork", "sourcecode"]

    def textElement(tag):
        return tag in [
            "annotation",
            "blockquote",
            "dd",
            "dt",
            "em",
            "li",
            "preamble",
            "refcontent",
            "strong",
            "sub",
            "sup",
            "t",
            "td",
            "th",
            "tt",
        ]

    def inline(tag):
        return tag in [
            "code",
            "contact",
            "cref",
            "em",
            "eref",
            "iref",
            "sub",
            "sup",
            "tt",
            "xref",
        ]

    def flush(self, tag, start=None):
        if Tidy.preserve(tag):
            c = f"<![CDATA[{self.c}]]>"
        else:
            c = escape(self.c)
            if Tidy.textElement(tag):
                if self.state == "open":
                    # The element is opening, so strip left is safe.
                    c = c.lstrip()
                if start is None or not Tidy.inline(start):
                    # The element is closing, or the element that is starting
                    # isn't inline, so strip right is safe.
                    c = c.rstrip()
                c = Tidy.pattern.sub(r"<bcp14>\1</bcp14>", c)
            else:
                c = c.strip()

        if c != "":
            if self.state == "open":
                print(">", end="")
            print(c, end="")
            self.state = "text"
            self.nl = False

        self.c = ""

    def currentTag(self):
        return next(reversed(self.tags), False)

    def startElement(self, tag, attributes):
        parent = self.currentTag()
        self.flush(parent, tag)

        if self.state == "open":
            print(">", end="")
            if not Tidy.inline(tag):
                print()

        self.tags.append(tag)
        if not Tidy.inline(tag):
            print("  " * self.nesting, end="")
            self.nesting = self.nesting + 1

        print(f"<{tag}", end="")
        for name, value in attributes.items():
            print(f" {name}={quoteattr(value)}", end="")

        self.state = "open"
        self.nl = False

    def endElement(self, tag):
        self.flush(self.tags.pop())

        if not Tidy.inline(tag):
            self.nesting = self.nesting - 1
            if self.nl and not Tidy.inline(self.currentTag()):
                print("  " * self.nesting, end="")
        if self.state == "open":
            print("/>", end="")
        else:
            print(f"</{tag}>", end="")
        self.nl = not Tidy.inline(tag)
        if self.nl:
            print()
        self.state = "close"

    def characters(self, content):
        self.c = self.c + content

    def processingInstruction(self, target, data):
        pass


parser = xml.sax.make_parser()
parser.setContentHandler(Tidy())
if len(sys.argv) >= 2:
    parser.parse(sys.argv[1])
else:
    parser.parse(sys.stdin)
