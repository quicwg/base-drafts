#!/usr/bin/env python3

import sys
import argparse
import re

parser = argparse.ArgumentParser(description="Lint markdown drafts.")
parser.add_argument("files", metavar="file", nargs="+", help="Files to lint")
parser.add_argument("-l", dest="maxLineLength", default=80)
parser.add_argument("-f", dest="maxFigureLineLength", default=65)

args = parser.parse_args()

foundError = False

for inputfile in args.files:
    insideFigure = False
    beforeAbstract = True

    with open(inputfile, mode="rt", newline=None, encoding="utf-8") as draft:
        linenumber = 0
        lines = draft.readlines()

        abstract = re.compile("^--- abstract")
        table = re.compile("^\s*(?:\||{:)")
        figure = re.compile("^[~`]{3,}")

        for line in lines:
            line = line.rstrip("\r\n")
            linenumber += 1

            def err(msg):
                foundError = True
                sys.stderr.write("{0}:{1}: {2}\n".format(inputfile, linenumber, msg))
                sys.stderr.write("{0}\n".format(line))

            if line.find("\t") >= 0:
                err("Line contains HTAB")

            # Skip everything before abstract
            if beforeAbstract:
                matchObj = abstract.match(line)
                if matchObj:
                    beforeAbstract = False
                continue

            # Skip tables
            matchObj = table.match(line)
            if matchObj:
                continue

            # Toggle figure state
            matchObj = figure.match(line)
            if matchObj:
                insideFigure = not insideFigure
                continue

            # Check length
            length = len(line)
            limit = args.maxFigureLineLength if insideFigure else args.maxLineLength
            if length > limit:
                err("Line is {0} characters; limit is {1}".format(length, limit))

sys.exit(1 if foundError else 0)
