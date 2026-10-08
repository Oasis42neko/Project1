const { getPlotNos, OUTSIDE_FIXED_PLOT_LABEL } = require("./plotAreas");

const plotOptions = [...getPlotNos(), OUTSIDE_FIXED_PLOT_LABEL];
const healthLevels = [
  "\u5065\u5eb7",
  "\u8f7b\u5ea6\u5f02\u5e38",
  "\u4e2d\u5ea6\u5f02\u5e38",
  "\u91cd\u5ea6\u5f02\u5e38",
  "\u6b7b\u4ea1"
];
const forestTypes = [
  "\u9488\u53f6\u6797",
  "\u9614\u53f6\u6797",
  "\u9488\u9614\u6df7\u4ea4\u6797"
];
const weatherOptions = [
  "\u6674",
  "\u9634",
  "\u5c0f\u96e8",
  "\u5927\u96e8"
];
const slopeAspects = [
  "\u9633\u5761",
  "\u534a\u9633\u5761",
  "\u9634\u5761",
  "\u534a\u9634\u5761"
];
const slopePositions = [
  "\u810a\u90e8",
  "\u4e0a\u90e8",
  "\u4e2d\u90e8",
  "\u4e0b\u90e8",
  "\u5c71\u8c37",
  "\u5e73\u5730"
];
const standOrigins = [
  "\u5929\u7136\u6797",
  "\u4eba\u5de5\u6797"
];
const moistureLevels = [
  "\u504f\u5e72",
  "\u9002\u4e2d",
  "\u6e7f\u6da6",
  "\u79ef\u6c34"
];
const commonLevels = [
  "\u65e0",
  "\u8f7b\u5fae",
  "\u4e2d\u7b49",
  "\u4e25\u91cd"
];
const vigorLevels = [
  "\u65fa\u76db",
  "\u6b63\u5e38",
  "\u8f83\u5f31",
  "\u8870\u5f31"
];
const growthStatuses = [
  "\u5b58\u6d3b",
  "\u503e\u659c",
  "\u6298\u65ad",
  "\u67af\u68a2",
  "\u67af\u7acb\u6728"
];
const phenologyOptions = [
  "\u5c55\u53f6\u671f",
  "\u5f00\u82b1\u671f",
  "\u7ed3\u5b9e\u671f",
  "\u843d\u53f6\u671f",
  "\u4f11\u7720\u671f"
];
const vitalityLevels = [
  "I",
  "II",
  "III"
];
const actionOptions = [
  "\u6301\u7eed\u89c2\u5bdf",
  "\u75c5\u866b\u5bb3\u590d\u67e5",
  "\u67af\u6b7b\u679d\u6e05\u7406",
  "\u8865\u690d\u4e61\u571f\u6811\u79cd",
  "\u8bbe\u7f6e\u4fdd\u62a4\u6807\u8bc6",
  "\u4e13\u5bb6\u590d\u6838"
];
const reviewStatusOptions = [
  "\u5f85\u590d\u6838",
  "\u5df2\u901a\u8fc7",
  "\u9000\u56de\u91cd\u6d4b"
];

const fieldSections = [
  {
    "title": "\u6837\u5730\u57fa\u7840",
    "fields": [
      {
        "key": "plotNo",
        "label": "\u6837\u5730\u7f16\u53f7",
        "type": "picker",
        "options": plotOptions,
        "required": true
      },
      {
        "key": "subplotNo",
        "label": "\u6837\u65b9\u7f16\u53f7",
        "type": "text",
        "placeholder": "\u5982 FH-13-01"
      },
      {
        "key": "recordDate",
        "label": "\u8c03\u67e5\u65e5\u671f",
        "type": "date",
        "required": true
      },
      {
        "key": "weather",
        "label": "\u5929\u6c14",
        "type": "picker",
        "options": [
          "\u6674",
          "\u9634",
          "\u5c0f\u96e8",
          "\u5927\u96e8"
        ]
      },
      {
        "key": "plotArea",
        "label": "\u6837\u65b9\u9762\u79ef",
        "type": "digit",
        "unit": "m\u00b2",
        "min": 0,
        "max": 10000,
        "placeholder": "400"
      },
      {
        "key": "forestType",
        "label": "\u6797\u5206\u7c7b\u578b",
        "type": "picker",
        "options": [
          "\u9488\u53f6\u6797",
          "\u9614\u53f6\u6797",
          "\u9488\u9614\u6df7\u4ea4\u6797"
        ],
        "required": true
      },
      {
        "key": "dominantSpecies",
        "label": "\u4f18\u52bf\u6811\u79cd",
        "type": "text",
        "placeholder": "\u6837\u65b9\u5185\u6797\u6728\u6570\u91cf\u6700\u591a\u7684\u6811\u79cd"
      },
      {
        "key": "standOrigin",
        "label": "\u6797\u6728\u8d77\u6e90",
        "type": "picker",
        "options": [
          "\u5929\u7136\u6797",
          "\u4eba\u5de5\u6797"
        ]
      },
      {
        "key": "investigator",
        "label": "\u8c03\u67e5\u4eba",
        "type": "text"
      },
      {
        "key": "recorder",
        "label": "\u8bb0\u5f55\u4eba",
        "type": "text",
        "required": true,
        "placeholder": "\u5fd7\u613f\u8005/\u4e13\u5bb6\u59d3\u540d"
      }
    ]
  },
  {
    "title": "\u5730\u5f62\u73af\u5883",
    "fields": [
      {
        "key": "slopeAspect",
        "label": "\u5761\u5411",
        "type": "picker",
        "options": [
          "\u9633\u5761",
          "\u534a\u9633\u5761",
          "\u9634\u5761",
          "\u534a\u9634\u5761"
        ]
      },
      {
        "key": "slopePosition",
        "label": "\u5761\u4f4d",
        "type": "picker",
        "options": [
          "\u810a\u90e8",
          "\u4e0a\u90e8",
          "\u4e2d\u90e8",
          "\u4e0b\u90e8",
          "\u5c71\u8c37",
          "\u5e73\u5730"
        ]
      },
      {
        "key": "slopeDegree",
        "label": "\u5761\u5ea6",
        "type": "digit",
        "unit": "\u00b0",
        "min": 0,
        "max": 90
      },
      {
        "key": "crownDensity",
        "label": "\u90c1\u95ed\u5ea6",
        "type": "digit",
        "min": 0,
        "max": 1,
        "placeholder": "0-1"
      },
      {
        "key": "soilMoisture",
        "label": "\u571f\u58e4\u6e7f\u5ea6",
        "type": "picker",
        "options": [
          "\u504f\u5e72",
          "\u9002\u4e2d",
          "\u6e7f\u6da6",
          "\u79ef\u6c34"
        ]
      }
    ]
  },
  {
    "title": "\u6837\u6728\u57fa\u7840",
    "fields": [
      {
        "key": "treeNo",
        "label": "\u6837\u6728\u7f16\u53f7",
        "type": "text",
        "required": true,
        "placeholder": "\u5982 FH-01-01 \u6216 \u56fa\u5b9a\u6837\u65b9\u4ee5\u5916\u533a\u57df-01"
      },
      {
        "key": "species",
        "label": "\u6811\u79cd\u540d\u79f0",
        "type": "text",
        "required": true,
        "placeholder": "\u5982 \u9999\u6a1f\u3001\u6749\u6728"
      },
      {
        "key": "latinName",
        "label": "\u62c9\u4e01\u540d",
        "type": "text",
        "placeholder": "\u53ef\u9009"
      },
      {
        "key": "photoNo",
        "label": "\u7167\u7247\u7f16\u53f7",
        "type": "text",
        "placeholder": "\u6bcf\u682a\u81f3\u5c11\u6811\u5e72\u548c\u6811\u51a0\u7167\u7247"
      }
    ]
  },
  {
    "title": "\u6bcf\u6728\u6d4b\u91cf",
    "fields": [
      {
        "key": "age",
        "label": "\u6811\u9f84",
        "type": "number",
        "unit": "\u5e74",
        "min": 0,
        "max": 2000,
        "placeholder": "\u4f30\u6d4b\u503c"
      },
      {
        "key": "dbh",
        "label": "\u80f8\u5f84 DBH",
        "type": "digit",
        "unit": "cm",
        "required": true,
        "min": 0,
        "max": 500
      },
      {
        "key": "height",
        "label": "\u6811\u9ad8",
        "type": "digit",
        "unit": "m",
        "required": true,
        "min": 0,
        "max": 120
      },
      {
        "key": "branchHeight",
        "label": "\u679d\u4e0b\u9ad8",
        "type": "digit",
        "unit": "m",
        "min": 0,
        "max": 80
      },
      {
        "key": "crownWidth",
        "label": "\u51a0\u5e45",
        "type": "digit",
        "unit": "m",
        "min": 0,
        "max": 80
      },
      {
        "key": "crownWidthNS",
        "label": "\u51a0\u5e45\uff08\u5357\u5317\uff09",
        "type": "digit",
        "unit": "m",
        "min": 0,
        "max": 80
      },
      {
        "key": "crownWidthEW",
        "label": "\u51a0\u5e45\uff08\u4e1c\u897f\uff09",
        "type": "digit",
        "unit": "m",
        "min": 0,
        "max": 80
      },
      {
        "key": "xInPlot",
        "label": "X \u5750\u6807\uff08\u6837\u65b9\u5185\uff09",
        "type": "digit",
        "unit": "m",
        "min": 0,
        "max": 20
      },
      {
        "key": "yInPlot",
        "label": "Y \u5750\u6807\uff08\u6837\u65b9\u5185\uff09",
        "type": "digit",
        "unit": "m",
        "min": 0,
        "max": 20
      }
    ]
  },
  {
    "title": "\u751f\u957f\u5065\u5eb7",
    "fields": [
      {
        "key": "growthStatus",
        "label": "\u751f\u957f\u72b6\u6001",
        "type": "picker",
        "options": [
          "\u5b58\u6d3b",
          "\u503e\u659c",
          "\u6298\u65ad",
          "\u67af\u68a2",
          "\u67af\u7acb\u6728"
        ]
      },
      {
        "key": "phenology",
        "label": "\u7269\u5019\u671f",
        "type": "picker",
        "options": [
          "\u5c55\u53f6\u671f",
          "\u5f00\u82b1\u671f",
          "\u7ed3\u5b9e\u671f",
          "\u843d\u53f6\u671f",
          "\u4f11\u7720\u671f"
        ]
      },
      {
        "key": "vitalityLevel",
        "label": "\u751f\u6d3b\u529b\u7b49\u7ea7",
        "type": "picker",
        "options": [
          "I",
          "II",
          "III"
        ]
      },
      {
        "key": "growthVigor",
        "label": "\u957f\u52bf",
        "type": "picker",
        "options": [
          "\u65fa\u76db",
          "\u6b63\u5e38",
          "\u8f83\u5f31",
          "\u8870\u5f31"
        ],
        "required": true
      },
      {
        "key": "healthLevel",
        "label": "\u5065\u5eb7\u7b49\u7ea7",
        "type": "picker",
        "options": [
          "\u5065\u5eb7",
          "\u8f7b\u5ea6\u5f02\u5e38",
          "\u4e2d\u5ea6\u5f02\u5e38",
          "\u91cd\u5ea6\u5f02\u5e38",
          "\u6b7b\u4ea1"
        ],
        "required": true
      },
      {
        "key": "pestLevel",
        "label": "\u866b\u5bb3\u7a0b\u5ea6",
        "type": "picker",
        "options": [
          "\u65e0",
          "\u8f7b\u5fae",
          "\u4e2d\u7b49",
          "\u4e25\u91cd"
        ],
        "required": true
      },
      {
        "key": "diseaseLevel",
        "label": "\u75c5\u5bb3\u7a0b\u5ea6",
        "type": "picker",
        "options": [
          "\u65e0",
          "\u8f7b\u5fae",
          "\u4e2d\u7b49",
          "\u4e25\u91cd"
        ],
        "required": true
      },
      {
        "key": "pestDiseaseDescription",
        "label": "\u75c5\u866b\u5bb3\u63cf\u8ff0",
        "type": "textarea",
        "placeholder": "\u5982\u6709\u75c5\u866b\u5bb3\u8bf7\u63cf\u8ff0"
      },
      {
        "key": "deadBranchRate",
        "label": "\u67af\u679d\u6bd4\u4f8b",
        "type": "digit",
        "unit": "%",
        "min": 0,
        "max": 100
      },
      {
        "key": "hollow",
        "label": "\u6811\u6d1e/\u8150\u673d",
        "type": "picker",
        "options": [
          "\u65e0",
          "\u8f7b\u5fae",
          "\u4e2d\u7b49",
          "\u4e25\u91cd"
        ]
      },
      {
        "key": "leaning",
        "label": "\u503e\u659c\u60c5\u51b5",
        "type": "picker",
        "options": [
          "\u65e0",
          "\u8f7b\u5fae",
          "\u660e\u663e",
          "\u5371\u9669"
        ]
      },
      {
        "key": "humanDisturbance",
        "label": "\u4eba\u4e3a\u5e72\u6270",
        "type": "picker",
        "options": [
          "\u65e0",
          "\u8f7b\u5fae",
          "\u4e2d\u7b49",
          "\u4e25\u91cd"
        ]
      },
      {
        "key": "conservationAction",
        "label": "\u5904\u7f6e\u5efa\u8bae",
        "type": "picker",
        "options": [
          "\u6301\u7eed\u89c2\u5bdf",
          "\u75c5\u866b\u5bb3\u590d\u67e5",
          "\u67af\u6b7b\u679d\u6e05\u7406",
          "\u8865\u690d\u4e61\u571f\u6811\u79cd",
          "\u8bbe\u7f6e\u4fdd\u62a4\u6807\u8bc6",
          "\u4e13\u5bb6\u590d\u6838"
        ],
        "required": true
      },
      {
        "key": "reviewStatus",
        "label": "\u590d\u6838\u72b6\u6001",
        "type": "picker",
        "options": [
          "\u5f85\u590d\u6838",
          "\u5df2\u901a\u8fc7",
          "\u9000\u56de\u91cd\u6d4b"
        ]
      }
    ]
  },
  {
    "title": "\u5907\u6ce8",
    "fields": [
      {
        "key": "remark",
        "label": "\u5907\u6ce8",
        "type": "textarea",
        "placeholder": "\u5982\u85e4\u672c\u7f20\u7ed5\u3001\u4eba\u4e3a\u635f\u4f24\u3001\u73b0\u573a\u7279\u5f81\u7b49"
      }
    ]
  }
];

const fieldLabels = fieldSections.reduce((labels, section) => {
  section.fields.forEach((field) => {
    labels[field.key] = field.label;
  });
  return labels;
}, {
  latitude: "\u7eac\u5ea6",
  longitude: "\u7ecf\u5ea6",
  altitude: "\u6d77\u62d4",
  images: "\u73b0\u573a\u7167\u7247",
});

const today = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const createEmptyTree = () => ({
  plotNo: "",
  subplotNo: "",
  treeNo: "",
  species: "",
  latinName: "",
  photoNo: "",
  forestType: "\u9488\u53f6\u6797",
  dominantSpecies: "",
  standOrigin: "\u4eba\u5de5\u6797",
  recordDate: today(),
  weather: "\u6674",
  plotArea: 400,
  investigator: "",
  recorder: "",
  age: "",
  dbh: "",
  height: "",
  branchHeight: "",
  crownWidth: "",
  crownWidthNS: "",
  crownWidthEW: "",
  xInPlot: "",
  yInPlot: "",
  crownDensity: "",
  slopeAspect: "",
  slopePosition: "",
  slopeDegree: "",
  soilMoisture: "\u9002\u4e2d",
  growthStatus: "\u5b58\u6d3b",
  phenology: "",
  vitalityLevel: "",
  growthVigor: "\u6b63\u5e38",
  healthLevel: "\u5065\u5eb7",
  pestLevel: "\u65e0",
  diseaseLevel: "\u65e0",
  pestDiseaseDescription: "",
  deadBranchRate: "",
  hollow: "\u65e0",
  leaning: "\u65e0",
  humanDisturbance: "\u65e0",
  conservationAction: "\u6301\u7eed\u89c2\u5bdf",
  reviewStatus: "\u5f85\u590d\u6838",
  latitude: "",
  longitude: "",
  altitude: "",
  locationSource: "",
  remark: "",
  images: [],
});

module.exports = {
  actionOptions,
  createEmptyTree,
  fieldLabels,
  fieldSections,
  forestTypes,
  healthLevels,
  phenologyOptions,
  plotOptions,
  reviewStatusOptions,
  vitalityLevels,
  weatherOptions,
};
