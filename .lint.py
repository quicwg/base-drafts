#!/usr/bin/env python3

import sys,getopt,re

def main(argv):
    inputfile = ''
    maxLineLength = 80
    maxFigureLineLength = 65
    foundError = False

    try:
        opts,args = getopt.getopt(argv,"i:lf")
    except getopt.GetoptError:
        print('.lint.py -i <input_file> [-l <line-length>] [-f <figure-line-length>]')
        sys.exit(2)

    for opt,arg in opts:
        if opt == "-i":
            inputfile = arg
        elif opt == "-l":
            maxLineLength = arg
        elif opt == "-f":
            maxFigureLineLength = arg

    insideFigure = False
    beforeAbstract = True
    with open(inputfile,'U') as draft:
        linecounter = 1
        lines = draft.readlines()
        for line in lines:
            line = line.rstrip('\r\n')
            linenumber = linecounter
            linecounter += 1

            ## Skip everything before abstract
            if beforeAbstract:
                matchObj = re.match('^--- abstract',line)
                if matchObj:
                    beforeAbstract = False
                continue

            ## Skip tables
            matchObj = re.match('^\s*\|',line)
            if matchObj:
                continue

            ## Toggle figure state
            matchObj = re.match('^[~`]{3,}',line)
            if matchObj:
                insideFigure = False if insideFigure else True
                continue

            ## Check length
            length = len(line)
            limit = maxFigureLineLength if insideFigure else maxLineLength
            if length > limit:
                foundError = True
                print("{0}: Line is {1} characters; limit is {2}".format(linenumber,length,limit))
                print(line)

    sys.exit( 1 if foundError else 0)

if __name__ == "__main__":
   main(sys.argv[1:])