###############################################################################
# Copyright 2014, 2015 IBM Corp.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
###############################################################################
import json,sys

if len(sys.argv) < 2:
    print "Usage get_from_json file <field>"
    exit (-1)

with open(sys.argv[1]) as f:
    data = json.load(f)
    if len(sys.argv) > 2:
        key = sys.argv[2]
        if key in data:
            print ("%s"%data[key])
    else:
        for key in data:
            print ("%s=%s"%(key, data[key]))
