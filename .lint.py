#!/usr/bin/env python3

import sys
import argparse
import re

parser = argparse.ArgumentParser(description='Lint markdown drafts.')
parser.add_argument('files', metavar='file', nargs='+', help='Files to lint')
parser.add_argument('-l', dest='maxLineLength', default=80)
parser.add_argument('-f', dest='maxFigureLineLength', default=65)

args = parser.parse_args()

foundError = False

for inputfile in args.files:
    insideFigure = False
    beforeAbstract = True
    with open(inputfile, mode='rt', newline=None, encoding='utf-8') as draft:
        linecounter = 1
        lines = draft.readlines()

        abstract = re.compile('^--- abstract')
        table = re.compile('^\s*(?:\||{:)')
        figure = re.compile('^[~`]{3,}')

        for line in lines:
            line = line.rstrip('\r\n')
            linenumber = linecounter
            linecounter += 1

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
                foundError = True
                sys.stderr.write("{0}: Line is {1} characters; limit is {2}\n".format(
                    linenumber, length, limit))
                sys.stderr.write("{0}\n".format(line))

sys.exit(1 if foundError else 0)
