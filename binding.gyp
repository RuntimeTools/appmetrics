{
  "variables": {
    "srcdir%": "./src",
    "agentcoredir%": "./omr-agentcore",
    "nandir%": "<!(node -e \"try {require('nan')}catch (e){console.log(e)}\")",
    'build_id%': '.<!(["python", "./generate_build_id.py"])',
    'appmetricsversion%':  '<!(["python", "./get_from_json.py", "./package.json", "version"])',
    "conditions": [
      ['OS=="aix"', {
        "SHARED_LIB_SUFFIX": ".a",
      }],
    ],
  },

  "target_defaults": {
    "cflags_cc!": [ '-fno-exceptions' ],
    "include_dirs": [ '<(srcdir)', '<(nandir)', '<(agentcoredir)/src'],
    "variables": {
      'travis%': "false"
    },
    "target_conditions": [
      ['_type=="shared_library"', {
        'product_prefix': '<(SHARED_LIB_PREFIX)',
        "conditions": [
          ['OS=="aix"', {
            'product_extension': 'a',
          },{
          }],
        ],
      }],
      ['travis=="true"', {
        "cflags_cc": [ '--coverage' ],
        "libraries": [ '--coverage' ],
      }],
    ],
    "conditions": [
      ['OS=="aix"', {
        "defines": [ "_AIX", "AIX" ],
        "libraries": [ "-Wl,-bexpall,-brtllib,-G,-bernotok,-brtl,-L.,-bnoipath" ],
      }],
      ['OS=="mac"', {
        "defines": [ "__MACH__", "__APPLE__",  ],
         "libraries": [ "-undefined dynamic_lookup" ],
      }],
      ['OS in "os390 zos"', {
        "defines": [ "_ZOS", "_UNIX03_THREADS" ],
        "cflags_cc": ['-Wc,EXPORTALL'],
        'cflags!': [ '-fno-omit-frame-pointer' ],
      }],
      ['OS=="linux"', {
        "defines": [ "_LINUX", "LINUX" ],
        "variables": {
          'travis': "<!(echo $TRAVIS)",
        },
      }],
      ['OS=="win"', {
        "defines": [ "_WINDOWS", "WINDOWS"  ],
        "libraries": [ "Ws2_32" ],
        "msvs_settings": {
          "VCCLCompilerTool": {
            "AdditionalOptions": [
              "/EHsc",
              "/MD",
            ]
          },
        },
      }]
    ],
  },

  "targets": [
    {
      "target_name": "omr-agentcore",
      "type": "none",
      "dependencies": [
        "<(agentcoredir)/binding.gyp:external",
      ],
    },
    {
      'target_name': 'heapdump',
      'win_delay_load_hook': 'false',
      'sources': [
        'src/heapdump/compat-inl.h',
        'src/heapdump/compat.h',
        'src/heapdump/heapdump-posix.h',
        'src/heapdump/heapdump-win32.h',
        'src/heapdump/heapdump.cc',
      ],
    },
    {
      "target_name": "appmetrics",
      "sources": [
        "<(INTERMEDIATE_DIR)/appmetrics.cpp",
        "<(srcdir)/headlessutils.cpp",
        "<(srcdir)/objecttracker.cpp",
      ],
      'variables': {
        'appmetricslevel%':'<(appmetricsversion)<(build_id)',
      },
      'actions': [{
        'action_name': 'Set appmetrics reported version/build level',
        'inputs': [ "<(srcdir)/appmetrics.cpp" ],
        'outputs': [ "<(INTERMEDIATE_DIR)/appmetrics.cpp" ],
        'action': [
          'python',
          './replace_in_file.py',
          '<(srcdir)/appmetrics.cpp',
          '<(INTERMEDIATE_DIR)/appmetrics.cpp',
          '--from="99\.99\.99\.29991231"',
          '--to="<(appmetricslevel)"',
          '-v'
         ],
      }],
    },
    {
      "target_name": "nodeenvplugin",
      "type": "shared_library",
      "sources": [
        "<(srcdir)/plugins/node/env/nodeenvplugin.cpp",
      ],
    },
    {
      "target_name": "nodeheapplugin",
      "type": "shared_library",
      "sources": [
        "<(srcdir)/plugins/node/heap/nodeheapplugin.cpp",
      ],
    },
    {
      "target_name": "nodeprofplugin",
      "type": "shared_library",
      "sources": [
        "<(srcdir)/plugins/node/prof/nodeprofplugin.cpp",
      ],
    },
    {
      "target_name": "nodeloopplugin",
      "type": "shared_library",
      "sources": [
        "<(srcdir)/plugins/node/loop/nodeloopplugin.cpp",
      ],
    },
    {
      "target_name": "nodegcplugin",
      "type": "shared_library",
      "sources": [
        "<(srcdir)/plugins/node/gc/nodegcplugin.cpp",
      ],
    },
    {
      "target_name": "install",
      "type": "none",
      "dependencies": [
        "omr-agentcore",
        "heapdump",
        "appmetrics",
        "nodeenvplugin",
        "nodegcplugin",
        "nodeprofplugin",
        "nodeloopplugin",
        "nodeheapplugin",
      ],
      "conditions": [
        ['OS in "os390 zos"', {
          "dependencies+": [
            "nodezmemoryplugin",
          ],
        }],
      ],
     "copies": [
       {
         "destination": "./",
         "files": [
           "<(PRODUCT_DIR)/appmetrics.node",
           "<(PRODUCT_DIR)/heapdump.node",
           "<(agentcoredir)/<(SHARED_LIB_PREFIX)agentcore<(SHARED_LIB_SUFFIX)",
         ],
       },
       {
         "destination": "./plugins",
         "files": [
           "<(PRODUCT_DIR)/<(SHARED_LIB_PREFIX)nodeenvplugin<(SHARED_LIB_SUFFIX)",
           "<(PRODUCT_DIR)/<(SHARED_LIB_PREFIX)nodeheapplugin<(SHARED_LIB_SUFFIX)",
           "<(PRODUCT_DIR)/<(SHARED_LIB_PREFIX)nodegcplugin<(SHARED_LIB_SUFFIX)",
           "<(PRODUCT_DIR)/<(SHARED_LIB_PREFIX)nodeprofplugin<(SHARED_LIB_SUFFIX)",
           "<(PRODUCT_DIR)/<(SHARED_LIB_PREFIX)nodeloopplugin<(SHARED_LIB_SUFFIX)",
           "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)hcmqtt<(SHARED_LIB_SUFFIX)",
           "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)cpuplugin<(SHARED_LIB_SUFFIX)",
           "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)envplugin<(SHARED_LIB_SUFFIX)",
           "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)memoryplugin<(SHARED_LIB_SUFFIX)",
           "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)hcapiplugin<(SHARED_LIB_SUFFIX)",
           "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)headlessplugin<(SHARED_LIB_SUFFIX)",
         ],
         "conditions": [
           ['OS in "os390 zos"', {
             # no hcmqtt, cpu or memory plugin
             "files!": [
               "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)hcmqtt<(SHARED_LIB_SUFFIX)",
               "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)cpuplugin<(SHARED_LIB_SUFFIX)",
               "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)memoryplugin<(SHARED_LIB_SUFFIX)",
               # the following don't work on zOS yet
               "<(agentcoredir)/plugins/<(SHARED_LIB_PREFIX)headlessplugin<(SHARED_LIB_SUFFIX)",
             ],
             "files+": [
               "<(PRODUCT_DIR)/<(SHARED_LIB_PREFIX)nodezmemoryplugin<(SHARED_LIB_SUFFIX)",
             ],
           }],
         ],
       },
     ],
    },
  ],
  "conditions": [
    ['OS in "os390 zos"', {
      "targets+": [
        {
          "target_name": "nodezmemoryplugin",
          "type": "shared_library",
          "sources": [
            "<(srcdir)/plugins/node/memory/nodezmemoryplugin.cpp",
          ],
        },
      ],
    }],
  ],
}
