#!/bin/bash
for filename in `find . | egrep '\.cpp'`;
do
    gcov -n -o . $filename > /dev/null;
done
