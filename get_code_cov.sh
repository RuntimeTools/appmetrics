#!/bin/bash
cd build
for sourceFilePath in `find ../src | egrep '\.cpp'`;
do
   baseName=`echo $sourceFilePath | awk -F/ '{n=split($0,a);split(a[n],b,".");print b[1]}'`
   objectFilePath=`find . -name $baseName.o`
   gcov $objectFilePath > /dev/null;
   mv $baseName.cpp.gcov ../
done
rm *.gcov
cd ..
