{
  "variables": {
    "srcdir%": "./src",
    "nandir%": "./node_modules/nan",
  },
  "conditions": [
    ['OS=="aix"', {
      "variables": {
        "SHARED_LIB_SUFFIX": ".a",
      },
    }],
  ],

  "target_defaults": {
    "cflags_cc!": [ '-fno-exceptions' ],
    "include_dirs": [ '<(srcdir)', '<(nandir)'],
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
    ],
    "conditions": [
      ['OS=="aix"', {
        "defines": [ "_AIX", "AIX" ],
        "libraries": [ "-Wl,-bexpall,-brtllib,-G,-bernotok,-brtl" ],
      }],
      ['OS=="linux"', {
        "defines": [ "_LINUX", "LINUX" ],
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
      "target_name": "nodeenvplugin",
      "type": "shared_library",
      "sources": [
        "<(srcdir)/plugins/node/env/nodeenvplugin.cpp",
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
        "nodeenvplugin",
        "nodegcplugin",
        "nodeprofplugin",
     ],
      "copies": [
        {
          "destination": "./plugins",
          "files": [
            "<(PRODUCT_DIR)/<(SHARED_LIB_PREFIX)nodeenvplugin<(SHARED_LIB_SUFFIX)",
            "<(PRODUCT_DIR)/<(SHARED_LIB_PREFIX)nodegcplugin<(SHARED_LIB_SUFFIX)",
            "<(PRODUCT_DIR)/<(SHARED_LIB_PREFIX)nodeprofplugin<(SHARED_LIB_SUFFIX)",
          ],
        },
      ],
    },
  ],
}

