const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const {
  getPlotCenterLocation,
  getPlotMatchStatus,
  getPlotNos,
  OUTSIDE_FIXED_PLOT_LABEL,
  parseCoordinateValue,
  formatCoordinateDms,
} = require("./plotAreas");
const COLLECTION = "forest_tree_records";
const USER_COLLECTION = "forest_users";
const LOCATION_COLLECTION = "forest_user_locations";
const CONFIG_COLLECTION = "forest_system_config";
const PEST_COLLECTION = "forest_pest_reports";
const SYSTEM_CONFIG_KEY = "global";
const DEFAULT_SYSTEM_CONFIG = { allowManualLocation: true };
const PEST_STATUS = ["待审核", "已受理", "已办结", "已驳回"];
const healthLevels = ["健康", "轻度异常", "中度异常", "重度异常", "死亡"];
const demoSpecies = ["樟树", "红锥", "木荷", "枫香", "沉香", "降香黄檀", "山杜英", "润楠", "青冈", "竹柏"];
const csvHeaders = [
  ["plotNo", "样地编号"],
  ["subplotNo", "样方编号"],
  ["treeNo", "样木编号"],
  ["species", "树种名称"],
  ["latinName", "拉丁名"],
  ["photoNo", "照片编号"],
  ["forestType", "林分类型"],
  ["dominantSpecies", "优势树种"],
  ["standOrigin", "林木起源"],
  ["recordDate", "调查日期"],
  ["weather", "天气"],
  ["plotArea", "样方面积m2"],
  ["investigator", "调查人"],
  ["recorder", "记录人"],
  ["age", "树龄"],
  ["dbh", "胸径cm"],
  ["height", "树高m"],
  ["branchHeight", "枝下高m"],
  ["crownWidth", "冠幅m"],
  ["crownWidthNS", "冠幅南北m"],
  ["crownWidthEW", "冠幅东西m"],
  ["xInPlot", "X坐标m"],
  ["yInPlot", "Y坐标m"],
  ["crownDensity", "郁闭度"],
  ["slopeAspect", "坡向"],
  ["slopePosition", "坡位"],
  ["slopeDegree", "坡度"],
  ["soilMoisture", "土壤湿度"],
  ["growthStatus", "生长状态"],
  ["phenology", "物候期"],
  ["vitalityLevel", "生活力等级"],
  ["growthVigor", "长势"],
  ["healthLevel", "健康等级"],
  ["pestLevel", "虫害程度"],
  ["diseaseLevel", "病害程度"],
  ["pestDiseaseDescription", "病虫害描述"],
  ["deadBranchRate", "枯枝比例%"],
  ["hollow", "树洞腐朽"],
  ["leaning", "倾斜情况"],
  ["humanDisturbance", "人为干扰"],
  ["conservationAction", "处置建议"],
  ["reviewStatus", "复核状态"],
  ["latitude", "纬度"],
  ["longitude", "经度"],
  ["altitude", "海拔m"],
  ["remark", "备注"],
  ["images", "现场照片"],
  ["createdBy", "提交人openid"],
  ["auditStatus", "审核状态"],
];

const ok = (data = null) => ({ success: true, data });
const fail = (errMsg) => ({ success: false, errMsg: String(errMsg && errMsg.message ? errMsg.message : errMsg) });

const ARK_API_URL = process.env.ARK_API_URL || "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const ARK_REQUEST_TIMEOUT_MS = 60000;

const getImageContentType = (fileID) => {
  const lower = String(fileID || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

const getRecordTimestamp = (value) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const fetchAllCollectionRecords = async (collectionName) => {
  const all = [];
  let skip = 0;
  const batchSize = 1000;
  while (true) {
    const res = await db.collection(collectionName).skip(skip).limit(batchSize).get();
    const batch = Array.isArray(res.data) ? res.data : [];
    all.push(...batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return all;
};

const getArkMessageText = (body) => {
  const content = body && body.choices && body.choices[0] && body.choices[0].message
    ? body.choices[0].message.content
    : "";
  if (Array.isArray(content)) {
    return content.map((item) => item && (item.text || item.content) || "").join("\n");
  }
  return String(content || "");
};

const parseArkPlantResult = (text) => {
  const source = String(text || "").trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : source;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  let parsed = {};
  if (objectMatch) {
    try {
      parsed = JSON.parse(objectMatch[0]);
    } catch (error) {
      parsed = {};
    }
  }
  const confidence = Number(parsed.confidence);
  const candidates = Array.isArray(parsed.candidates)
    ? parsed.candidates.map((item) => {
      if (typeof item === "string") return { species: item, latinName: "", confidence: "" };
      return {
        species: String(item && (item.species || item.commonName) || ""),
        latinName: String(item && (item.latinName || item.scientificName) || ""),
        confidence: item && item.confidence !== undefined ? item.confidence : "",
      };
    }).filter((item) => item.species)
    : [];
  return {
    species: String(parsed.species || parsed.commonName || ""),
    latinName: String(parsed.latinName || parsed.scientificName || ""),
    confidence: Number.isNaN(confidence) ? "" : confidence,
    candidates,
    reason: String(parsed.reason || parsed.basis || ""),
    uncertain: parsed.uncertain === true || String(parsed.uncertain || "").toLowerCase() === "true",
    rawText: source,
  };
};

const parseArkPestResult = (text) => {
  const source = String(text || "").trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : source;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  let parsed = {};
  if (objectMatch) {
    try {
      parsed = JSON.parse(objectMatch[0]);
    } catch (error) {
      parsed = {};
    }
  }
  const rawCategory = String(parsed.category || parsed.type || parsed.classification || "");
  const category = rawCategory.includes("\u866b") || rawCategory.toLowerCase().includes("pest")
    ? "\u866b\u5bb3"
    : rawCategory.includes("\u75c5") || rawCategory.toLowerCase().includes("disease")
      ? "\u75c5\u5bb3"
      : rawCategory;
  const confidence = Number(parsed.confidence);
  const candidates = Array.isArray(parsed.candidates)
    ? parsed.candidates.map((item) => ({
      name: typeof item === "string" ? item : String(item && (item.name || item.pestName || item.diseaseName || item.commonName) || ""),
      category: typeof item === "string" ? "" : String(item && (item.category || item.type) || ""),
      severity: typeof item === "string" ? "" : String(item && (item.severity || item.urgency) || ""),
    })).filter((item) => item.name)
    : [];
  return {
    category,
    name: String(parsed.name || parsed.pestName || parsed.diseaseName || parsed.commonName || ""),
    severity: String(parsed.severity || parsed.urgency || ""),
    confidence: Number.isNaN(confidence) ? "" : confidence,
    candidates,
    reason: String(parsed.reason || parsed.basis || ""),
    description: String(parsed.description || parsed.symptoms || ""),
    uncertain: parsed.uncertain === true || String(parsed.uncertain || "").toLowerCase() === "true",
    rawText: source,
  };
};


const resolveVisionImage = async (fileID) => {
  try {
    const tempResult = await cloud.getTempFileURL({ fileList: [fileID] });
    const tempFile = tempResult && Array.isArray(tempResult.fileList) ? tempResult.fileList[0] : null;
    if (tempFile && tempFile.tempFileURL) {
      return { url: tempFile.tempFileURL, mode: "temp-url" };
    }
  } catch (error) {
    console.warn("vision temp url unavailable, fallback to base64", error && error.message ? error.message : error);
  }

  const file = await cloud.downloadFile({ fileID });
  const buffer = file && file.fileContent;
  if (!buffer || !buffer.length) throw new Error("\u65e0\u6cd5\u8bfb\u53d6\u5f85\u8bc6\u522b\u56fe\u7247");
  if (buffer.length > 6 * 1024 * 1024) throw new Error("\u56fe\u7247\u8fc7\u5927\uff0c\u8bf7\u538b\u7f29\u540e\u518d\u8bc6\u522b");
  const contentType = getImageContentType(fileID);
  return {
    url: `data:${contentType};base64,${buffer.toString("base64")}`,
    mode: "base64",
    bytes: buffer.length,
  };
};
const recognizePlant = async (event) => {
  requireOpenId();
  const apiKey = String(process.env.ARK_API_KEY || "").trim();
  const modelId = String(process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL_ID || "").trim();
  const task = event.task === "pest" ? "pest" : "plant";
  const fileID = String(event.fileID || "").trim();
  if (!apiKey || !modelId) {
    throw new Error("\u4e91\u51fd\u6570\u5c1a\u672a\u914d\u7f6e ARK_API_KEY \u548c ARK_ENDPOINT_ID");
  }
  if (!fileID.startsWith("cloud://")) {
    throw new Error("\u8bc6\u56fe\u56fe\u7247\u5fc5\u987b\u5148\u4e0a\u4f20\u5230\u4e91\u5b58\u50a8");
  }

  const imageSource = await resolveVisionImage(fileID);
  const prompt = task === "pest"
    ? [
      "Identify visible forest pests or diseases.",
      "If unsure, keep the answer conservative and mark uncertain=true.",
      "Return JSON only with keys: category, name, severity, confidence, description, reason, uncertain.",
      "{\"category\":\"病害 or 虫害 or 无法判断\",\"name\":\"name\",\"severity\":\"一般 or 较急 or 紧急\",\"confidence\":0.0,\"description\":\"symptoms\",\"reason\":\"evidence\",\"uncertain\":true}",
    ].join("\n")
    : [
      "Identify the most likely plant species in the image.",
      "If unsure, keep the answer conservative and mark uncertain=true.",
      "Return JSON only with keys: species, latinName, confidence, reason, uncertain.",
      '{"species":"Chinese common name","latinName":"Latin name or empty","confidence":0.0,"reason":"evidence","uncertain":true}',
    ].join("\n");
  const requestBody = {
    model: modelId,
    max_tokens: 120,
    temperature: 0,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageSource.url } },
      ],
    }],
  };

  console.log("vision request prepared", { task, imageMode: imageSource.mode, imageBytes: imageSource.bytes || 0 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARK_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(ARK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error("\u8bc6\u56fe\u670d\u52a1\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5");
    throw new Error(`\u8bc6\u56fe\u670d\u52a1\u8fde\u63a5\u5931\u8d25\uff1a${error.message || error}`);
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body && body.error && (body.error.message || body.error.code);
    if (message && /does not exist|do not have access|not found/i.test(String(message))) {
      throw new Error("\u5f53\u524d\u6a21\u578b\u6216\u63a8\u7406\u63a5\u5165\u70b9\u4e0d\u53ef\u7528\uff0c\u8bf7\u5728\u65b9\u821f\u521b\u5efa\u652f\u6301\u56fe\u7247\u8f93\u5165\u7684\u63a8\u7406\u63a5\u5165\u70b9\uff0c\u5e76\u5c06 ep- \u5f00\u5934\u7684 ID \u586b\u5165 ARK_ENDPOINT_ID");
    }
    throw new Error(`\u8c46\u5305\u8bc6\u56fe\u8c03\u7528\u5931\u8d25\uff1a${message || `HTTP ${response.status}`}`);
  }
  const result = task === "pest" ? parseArkPestResult(getArkMessageText(body)) : parseArkPlantResult(getArkMessageText(body));
  const hasMainResult = task === "pest" ? result.name : result.species;
  if (!hasMainResult && !result.candidates.length) {
    result.uncertain = true;
    result.reason = result.reason || (task === "pest" ? "\u6a21\u578b\u672a\u7ed9\u51fa\u660e\u7684\u75c5\u866b\u5bb3\u5224\u65ad" : "\u6a21\u578b\u6ca1\u6709\u7ed9\u51fa\u660e\u786e\u7684\u690d\u7269\u79cd\u7c7b");
  }
  return ok(result);
};

const ensureCollectionByName = async (name) => {
  try {
    await db.createCollection(name);
  } catch (error) {
    const message = String(error.errMsg || error.message || "").toLowerCase();
    const code = String(error.errCode || error.code || "");
    const existed = message.includes("already exists")
      || message.includes("collection exist")
      || message.includes("table exist")
      || message.includes("resourceexist")
      || message.includes("database collection already exist")
      || message.includes("集合已存在")
      || code === "-501001";
    if (!existed) {
      throw error;
    }
  }
};

const ensureCollection = async () => ensureCollectionByName(COLLECTION);
const ensureUserCollection = async () => ensureCollectionByName(USER_COLLECTION);
const ensureLocationCollection = async () => ensureCollectionByName(LOCATION_COLLECTION);
const ensureConfigCollection = async () => ensureCollectionByName(CONFIG_COLLECTION);
const ensurePestCollection = async () => ensureCollectionByName(PEST_COLLECTION);

const requireOpenId = () => {
  const wxContext = cloud.getWXContext();
  if (!wxContext.OPENID) {
    throw new Error("用户未登录");
  }
  return wxContext;
};

const getUserByOpenId = async (openid) => {
  await ensureUserCollection();
  const res = await db.collection(USER_COLLECTION).where({ openid }).limit(1).get();
  return res.data[0] || null;
};

const getCurrentUser = async () => {
  const wxContext = requireOpenId();
  let user = await getUserByOpenId(wxContext.OPENID);
  if (!user) {
    const created = await db.collection(USER_COLLECTION).add({
      data: {
        openid: wxContext.OPENID,
        appid: wxContext.APPID,
        unionid: wxContext.UNIONID || "",
        role: "recorder",
        createdAt: db.serverDate(),
        lastLoginAt: db.serverDate(),
      },
    });
    user = { _id: created._id, openid: wxContext.OPENID, role: "recorder" };
  }
  return user;
};

const isAdmin = (user) => user && user.role === "admin";

const ensureAdmin = (user) => {
  if (!isAdmin(user)) {
    throw new Error("权限不足：仅管理员可执行该操作");
  }
};

const getOpenId = async () => {
  const wxContext = requireOpenId();
  return ok({ openid: wxContext.OPENID, appid: wxContext.APPID, unionid: wxContext.UNIONID });
};

const loginUser = async (event) => {
  await ensureUserCollection();
  const wxContext = requireOpenId();
  const profile = event.profile || {};
  const users = await db.collection(USER_COLLECTION).limit(1).get();
  const admins = await db.collection(USER_COLLECTION).where({ role: "admin" }).limit(1).get();
  const existed = await db.collection(USER_COLLECTION).where({ openid: wxContext.OPENID }).limit(1).get();
  const shouldBeAdmin = users.data.length === 0 || admins.data.length === 0;
  const baseData = {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID || "",
    nickName: profile.nickName || "",
    avatarUrl: profile.avatarUrl || "",
    lastLoginAt: db.serverDate(),
  };

  if (existed.data.length) {
    const role = shouldBeAdmin ? "admin" : (existed.data[0].role || "recorder");
    await db.collection(USER_COLLECTION).doc(existed.data[0]._id).update({ data: { ...baseData, role } });
    return ok({ ...existed.data[0], ...baseData, role, _id: existed.data[0]._id });
  }

  const role = shouldBeAdmin ? "admin" : "recorder";
  const created = await db.collection(USER_COLLECTION).add({ data: { ...baseData, role, createdAt: db.serverDate() } });
  return ok({ _id: created._id, ...baseData, role });
};

const listUsers = async () => {
  const currentUser = await getCurrentUser();
  ensureAdmin(currentUser);
  await ensureCollection();
  const [usersRes, recordsRes] = await Promise.all([
    db.collection(USER_COLLECTION).orderBy("lastLoginAt", "desc").limit(200).get(),
    db.collection(COLLECTION).limit(1000).get(),
  ]);
  const recordCounts = recordsRes.data.reduce((counts, record) => {
    const openid = record.createdBy || "";
    if (openid) counts[openid] = (counts[openid] || 0) + 1;
    return counts;
  }, {});
  const users = usersRes.data.map((user) => ({
    _id: user._id,
    openid: user.openid,
    role: user.role || "recorder",
    nickName: user.nickName || "",
    avatarUrl: user.avatarUrl || "",
    recordCount: recordCounts[user.openid] || 0,
    isCurrent: user.openid === currentUser.openid,
  }));
  return ok({ users, currentOpenid: currentUser.openid });
};

const updateUserRole = async (event) => {
  const currentUser = await getCurrentUser();
  ensureAdmin(currentUser);
  const userId = event.userId;
  const role = event.role;
  if (!["admin", "recorder"].includes(role)) {
    throw new Error("角色参数无效");
  }
  const target = await db.collection(USER_COLLECTION).doc(userId).get();
  if (!target.data || !target.data.openid) {
    throw new Error("用户不存在");
  }
  if ((target.data.role || "recorder") === "admin" && role === "recorder") {
    const admins = await db.collection(USER_COLLECTION).where({ role: "admin" }).limit(200).get();
    if (admins.data.length <= 1) {
      throw new Error("至少需要保留一名管理员");
    }
  }
  await db.collection(USER_COLLECTION).doc(userId).update({
    data: {
      role,
      updatedAt: db.serverDate(),
      updatedBy: currentUser.openid,
    },
  });
  return ok({ _id: userId, role });
};



const ensureSystemConfig = async () => {
  await ensureConfigCollection();
  const existed = await db.collection(CONFIG_COLLECTION).where({ key: SYSTEM_CONFIG_KEY }).limit(1).get();
  if (existed.data.length) {
    return { ...DEFAULT_SYSTEM_CONFIG, ...(existed.data[0].settings || {}), _id: existed.data[0]._id };
  }
  const created = await db.collection(CONFIG_COLLECTION).add({
    data: {
      key: SYSTEM_CONFIG_KEY,
      settings: DEFAULT_SYSTEM_CONFIG,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return { ...DEFAULT_SYSTEM_CONFIG, _id: created._id };
};

const getSystemSettings = async () => {
  await getCurrentUser();
  const settings = await ensureSystemConfig();
  delete settings._id;
  return ok(settings);
};

const updateSystemSettings = async (event) => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  const current = await ensureSystemConfig();
  const settings = {
    ...DEFAULT_SYSTEM_CONFIG,
    ...current,
    allowManualLocation: event.allowManualLocation !== false,
  };
  delete settings._id;
  await db.collection(CONFIG_COLLECTION).doc(current._id).update({
    data: {
      settings,
      updatedAt: db.serverDate(),
      updatedBy: user.openid,
    },
  });
  return ok(settings);
};

const updateMyLocation = async (event) => {
  const user = await getCurrentUser();
  await ensureLocationCollection();
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);
  const altitude = event.altitude === undefined || event.altitude === "" ? "" : Number(event.altitude);
  const accuracy = event.accuracy === undefined || event.accuracy === "" ? "" : Number(event.accuracy);
  if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) throw new Error("\u7eac\u5ea6\u65e0\u6548");
  if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) throw new Error("\u7ecf\u5ea6\u65e0\u6548");

  const data = {
    openid: user.openid,
    nickName: user.nickName || "",
    avatarUrl: user.avatarUrl || "",
    role: user.role || "recorder",
    latitude,
    longitude,
    altitude: Number.isNaN(altitude) ? "" : altitude,
    accuracy: Number.isNaN(accuracy) ? "" : accuracy,
    isOnline: true,
    source: event.source || "system",
    updatedAt: db.serverDate(),
  };
  const existed = await db.collection(LOCATION_COLLECTION).where({ openid: user.openid }).limit(1).get();
  if (existed.data.length) {
    await db.collection(LOCATION_COLLECTION).doc(existed.data[0]._id).update({ data });
    return ok({ _id: existed.data[0]._id });
  }
  const created = await db.collection(LOCATION_COLLECTION).add({ data: { ...data, createdAt: db.serverDate() } });
  return ok({ _id: created._id });
};

const setMyLocationOffline = async () => {
  const user = await getCurrentUser();
  await ensureLocationCollection();
  const existed = await db.collection(LOCATION_COLLECTION).where({ openid: user.openid }).limit(1).get();
  if (existed.data.length) {
    await db.collection(LOCATION_COLLECTION).doc(existed.data[0]._id).update({
      data: {
        isOnline: false,
        updatedAt: db.serverDate(),
      },
    });
  }
  return ok({ openid: user.openid, isOnline: false });
};

const listUserLocations = async () => {
  const currentUser = await getCurrentUser();
  ensureAdmin(currentUser);
  await ensureLocationCollection();
  await ensureUserCollection();
  const [locationsRes, usersRes] = await Promise.all([
    db.collection(LOCATION_COLLECTION).limit(200).get(),
    db.collection(USER_COLLECTION).limit(200).get(),
  ]);
  const userMap = usersRes.data.reduce((map, user) => {
    map[user.openid] = user;
    return map;
  }, {});
  const now = Date.now();
  const locations = locationsRes.data.map((item) => {
    const user = userMap[item.openid] || {};
    const updatedAt = item.updatedAt;
    const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt || 0).getTime();
    const isOnline = item.isOnline !== false && timestamp && now - timestamp < 5 * 60 * 1000;
    return {
      _id: item._id,
      openid: item.openid,
      nickName: user.nickName || item.nickName || "",
      avatarUrl: user.avatarUrl || item.avatarUrl || "",
      role: user.role || item.role || "recorder",
      latitude: item.latitude,
      longitude: item.longitude,
      altitude: item.altitude || "",
      accuracy: item.accuracy || "",
      isOnline,
      updatedAt: item.updatedAt || null,
    };
  }).sort((a, b) => Number(b.isOnline) - Number(a.isOnline));
  return ok({ locations });
};

const getMiniProgramCode = async () => {
  requireOpenId();
  const resp = await cloud.openapi.wxacode.get({ path: "pages/index/index" });
  const upload = await cloud.uploadFile({ cloudPath: "forest-health/code.png", fileContent: resp.buffer });
  return ok({ fileID: upload.fileID });
};

const normalizeRecord = (record, openid) => {
  const numericFields = ["age", "dbh", "height", "branchHeight", "crownWidth", "crownWidthNS", "crownWidthEW", "xInPlot", "yInPlot", "crownDensity", "plotArea", "slopeDegree", "deadBranchRate", "latitude", "longitude", "altitude"];
  const normalized = { ...record };
  delete normalized._id;
  delete normalized._canEdit;
  delete normalized._canDelete;
  delete normalized.coverUrl;
  delete normalized.systemSettings;
  numericFields.forEach((key) => {
    if (normalized[key] !== undefined && normalized[key] !== "") {
      if (key === "latitude" || key === "longitude") {
        normalized[key] = parseCoordinateValue(normalized[key]);
      } else {
        normalized[key] = Number(normalized[key]);
      }
    }
  });
  normalized.images = Array.isArray(normalized.images) ? normalized.images : [];
  normalized.reviewStatus = normalized.reviewStatus || "待复核";
  normalized.updatedAt = db.serverDate();
  normalized.updatedBy = openid;
  return normalized;
};

const fieldNames = {
  plotNo: "\u89c2\u6d4b\u6837\u65b9",
  treeNo: "\u6837\u6811\u7f16\u53f7",
  species: "\u6811\u79cd",
  forestType: "\u6797\u5206\u7c7b\u578b",
  recordDate: "\u8c03\u67e5\u65e5\u671f",
  recorder: "\u8bb0\u5f55\u4eba",
  dbh: "\u80f8\u5f84",
  height: "\u6811\u9ad8",
  growthVigor: "\u957f\u52bf",
  healthLevel: "\u5065\u5eb7\u7b49\u7ea7",
  pestLevel: "\u866b\u5bb3\u7a0b\u5ea6",
  diseaseLevel: "\u75c5\u5bb3\u7a0b\u5ea6",
  conservationAction: "\u5904\u7f6e\u5efa\u8bae",
  latitude: "\u7eac\u5ea6",
  longitude: "\u7ecf\u5ea6",
  altitude: "\u6d77\u62d4",
  images: "\u73b0\u573a\u7167\u7247",
};

const isBlankValue = (value) => value === undefined || value === null || String(value).trim() === "";

const todayKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

const treeNoPattern = /^(?:FH-\d{2}|\u56fa\u5b9a\u6837\u65b9\u4ee5\u5916\u533a\u57df)-\d{2,3}$/;
const plotNoPattern = /^(?:FH-\d{2}|\u56fa\u5b9a\u6837\u65b9\u4ee5\u5916\u533a\u57df)$/;
const validPlotNos = new Set([...getPlotNos(), OUTSIDE_FIXED_PLOT_LABEL]);
const severeLevels = new Set(["\u4e25\u91cd"]);

const ensureUniqueTreeNo = async (record, currentId = "") => {
  if (isBlankValue(record.plotNo) || isBlankValue(record.treeNo)) return;
  const existed = await db.collection(COLLECTION)
    .where({ plotNo: record.plotNo, treeNo: record.treeNo })
    .limit(10)
    .get();
  const duplicate = existed.data.find((item) => item._id !== currentId);
  if (duplicate) {
    throw new Error("\u540c\u4e00\u6837\u65b9\u4e0b\u6837\u6811\u7f16\u53f7\u5df2\u5b58\u5728\uff0c\u8bf7\u68c0\u67e5\u662f\u5426\u91cd\u590d\u5f55\u5165");
  }
};

const validateRecord = async (record, currentId = "") => {
  const errors = [];
  const required = ["plotNo", "treeNo", "species", "forestType", "recordDate", "recorder", "dbh", "height", "growthVigor", "healthLevel", "pestLevel", "diseaseLevel", "conservationAction", "latitude", "longitude", "altitude"];
  const missing = required.filter((key) => isBlankValue(record[key]));
  if (missing.length) {
    errors.push(`\u7f3a\u5c11\u5fc5\u586b\u5b57\u6bb5\uff1a${missing.map((key) => fieldNames[key] || key).join("\u3001")}`);
  }
  if (!Array.isArray(record.images) || record.images.length === 0) {
    errors.push("\u73b0\u573a\u7167\u7247\u4e0d\u80fd\u4e3a\u7a7a");
  }

  const ranges = {
    age: [0, 2000, "\u6811\u9f84"],
    dbh: [0, 500, "\u80f8\u5f84"],
    height: [0, 120, "\u6811\u9ad8"],
    branchHeight: [0, 80, "\u679d\u4e0b\u9ad8"],
    crownWidth: [0, 80, "\u51a0\u5e45"],
    crownWidthNS: [0, 80, "冠幅（南北m）"],
    crownWidthEW: [0, 80, "冠幅（东西m）"],
    xInPlot: [0, 20, "X\u5750\u6807"],
    yInPlot: [0, 20, "Y\u5750\u6807"],
    crownDensity: [0, 1, "\u90c1\u95ed\u5ea6"],
    plotArea: [0, 10000, "\u6837\u65b9\u9762\u79ef"],
    slopeDegree: [0, 90, "\u5761\u5ea6"],
    deadBranchRate: [0, 100, "\u67af\u679d\u6bd4\u4f8b"],
    latitude: [-90, 90, "\u7eac\u5ea6"],
    longitude: [-180, 180, "\u7ecf\u5ea6"],
    altitude: [0, 3000, "\u6d77\u62d4"],
  };
  Object.keys(ranges).forEach((key) => {
    if (isBlankValue(record[key])) return;
    const value = (key === "latitude" || key === "longitude") ? parseCoordinateValue(record[key]) : Number(record[key]);
    const [min, max, label] = ranges[key];
    if (Number.isNaN(value)) {
      errors.push(`${label}\u5fc5\u987b\u662f\u6570\u5b57`);
      return;
    }
    if (value < min || value > max) {
      errors.push(`${label}\u8303\u56f4\u5e94\u5728 ${min} \u5230 ${max} \u4e4b\u95f4`);
    }
  });

  if (!isBlankValue(record.recordDate) && String(record.recordDate) > todayKey()) {
    errors.push("\u8c03\u67e5\u65e5\u671f\u4e0d\u80fd\u665a\u4e8e\u4eca\u5929");
  }
  if (!isBlankValue(record.plotNo)) {
    const plotNo = String(record.plotNo);
    if (!plotNoPattern.test(plotNo)) {
      errors.push("\u89c2\u6d4b\u6837\u65b9\u683c\u5f0f\u5e94\u4e3a FH-01");
    } else if (!validPlotNos.has(plotNo)) {
      errors.push("\u89c2\u6d4b\u6837\u65b9\u4e0d\u5728\u5f53\u524d\u6837\u5730\u914d\u7f6e\u4e2d");
    }
  }
  if (!isBlankValue(record.treeNo) && !treeNoPattern.test(String(record.treeNo))) {
    errors.push("\u6837\u6728\u7f16\u53f7\u683c\u5e94\u4e3a FH-01-01 \u6216 \u56fa\u5b9a\u6837\u65b9\u4ee5\u5916\u533a\u57df-01");
  }
  if (!isBlankValue(record.plotNo) && !isBlankValue(record.treeNo) && !String(record.treeNo).startsWith(`${String(record.plotNo)}-`)) {
    errors.push("\u6837\u6811\u7f16\u53f7\u5e94\u4e0e\u89c2\u6d4b\u6837\u65b9\u4e00\u81f4");
  }

  if (String(record.plotNo) !== OUTSIDE_FIXED_PLOT_LABEL) {
    const plotMatch = getPlotMatchStatus(record.plotNo, record.latitude, record.longitude);
    if (plotMatch.state === "missingArea") {
      errors.push("\u6240\u9009\u6837\u65b9\u6682\u672a\u914d\u7f6e\u7ecf\u7eac\u5ea6\u8303\u56f4");
    }
    if (plotMatch.state === "mismatch") {
      errors.push("\u5b9a\u4f4d\u4e0d\u5339\u914d\uff1a\u5f53\u524d\u5750\u6807\u4e0d\u5728\u6240\u9009\u6837\u65b9 20m \u00d7 20m \u8303\u56f4\u5185");
    }
  }

  const locationSource = String(record.locationSource || "");
  if (record.systemSettings && record.systemSettings.allowManualLocation === false && ["manual", "map", "plotCenter"].includes(locationSource)) {
    errors.push("\u7ba1\u7406\u5458\u5df2\u5173\u95ed\u624b\u52a8\u5b9a\u4f4d\uff0c\u8bf7\u4f7f\u7528\u81ea\u52a8\u5b9a\u4f4d\u540e\u4fdd\u5b58");
  }

  const hasDeadBranchRate = !isBlankValue(record.deadBranchRate);
  const deadBranchRate = Number(record.deadBranchRate);
  if (hasDeadBranchRate && !Number.isNaN(deadBranchRate) && record.healthLevel === "\u5065\u5eb7" && deadBranchRate > 20) {
    errors.push("\u5065\u5eb7\u6811\u7684\u67af\u679d\u6bd4\u4f8b\u4e0d\u5e94\u8fc7\u9ad8");
  }
  if (hasDeadBranchRate && !Number.isNaN(deadBranchRate) && record.healthLevel === "\u6b7b\u4ea1" && deadBranchRate < 50) {
    errors.push("\u6b7b\u4ea1\u6837\u6811\u7684\u67af\u679d\u6bd4\u4f8b\u5e94\u660e\u663e\u504f\u9ad8");
  }
  if (record.healthLevel === "\u5065\u5eb7" && (severeLevels.has(record.pestLevel) || severeLevels.has(record.diseaseLevel))) {
    errors.push("\u5065\u5eb7\u6811\u7684\u866b\u5bb3\u6216\u75c5\u5bb3\u7ea7\u522b\u4e0d\u5e94\u4e3a\u4e25\u91cd");
  }

  if (errors.length) {
    throw new Error(errors.join("\uff1b"));
  }
  await ensureUniqueTreeNo(record, currentId);
};

const auditTextContent = async (record) => {
  const content = [record.treeNo, record.species, record.latinName, record.photoNo, record.recorder, record.investigator, record.pestDiseaseDescription, record.remark]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000);
  if (!content.trim()) return;
  try {
    const res = await cloud.openapi.security.msgSecCheck({ content });
    const result = res.result || res;
    if (result.suggest && result.suggest !== "pass") throw new Error("文本内容安全审核未通过");
  } catch (error) {
    const msg = String(error.errMsg || error.message || "");
    if (msg.includes("87014") || msg.includes("risky") || msg.includes("未通过")) {
      throw new Error("文本内容安全审核未通过，请修改后再提交");
    }
    throw new Error(`文本内容安全审核失败：${msg}`);
  }
};

const contentTypeFromPath = (fileID) => {
  const lower = String(fileID).toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

const auditImages = async (images) => {
  const cloudImages = (images || []).filter((fileID) => String(fileID).startsWith("cloud://"));
  for (let index = 0; index < cloudImages.length; index += 1) {
    const fileID = cloudImages[index];
    try {
      const file = await cloud.downloadFile({ fileID });
      await cloud.openapi.security.imgSecCheck({
        media: {
          contentType: contentTypeFromPath(fileID),
          value: file.fileContent,
        },
      });
    } catch (error) {
      const msg = String(error.errMsg || error.message || "");
      if (msg.includes("87014") || msg.includes("risky")) {
        throw new Error(`第${index + 1} 张照片内容安全审核未通过`);
      }
      throw new Error(`照片内容安全审核失败：${msg}`);
    }
  }
};

const auditRecord = async (record) => {
  await auditTextContent(record);
  await auditImages(record.images || []);
};

const enrichRecord = (record, user) => ({
  ...record,
  id: record.id || record._id || record.treeNo,
  displayNo: record.treeNo || record.id || record._id,
    status: record.status || (record.latitude && record.longitude ? "已定位" : "待补坐标"),
  statusClass: record.statusClass || (record.latitude && record.longitude ? "healthy" : "watch"),
  images: Array.isArray(record.images) ? record.images : (record.image ? [record.image] : []),
  _canEdit: isAdmin(user) || record.createdBy === user.openid,
  _canDelete: isAdmin(user),
});

const initForestProject = async () => {
  requireOpenId();
  await ensureCollection();
  await ensureUserCollection();
  await ensureLocationCollection();
  await ensureConfigCollection();
  await ensurePestCollection();
  await ensureSystemConfig();
  return ok({ collection: COLLECTION, userCollection: USER_COLLECTION, locationCollection: LOCATION_COLLECTION, configCollection: CONFIG_COLLECTION, pestCollection: PEST_COLLECTION });
};

const listTrees = async (event) => {
  await ensureCollection();
  const user = await getCurrentUser();
  const pageSize = Math.min(Number(event.pageSize || event.limit || 15), 50);
  const page = Math.max(Number(event.page || 1), 1);
  const keyword = String(event.keyword || "").trim().toLowerCase();
  const allRecords = await fetchAllCollectionRecords(COLLECTION);
  const summary = allRecords.reduce((acc, record) => {
    acc.total += 1;
    if (record.latitude && record.longitude) acc.withCoordinates += 1;
    else acc.withoutCoordinates += 1;
    return acc;
  }, { total: 0, withCoordinates: 0, withoutCoordinates: 0 });
  const sorted = allRecords.sort((a, b) => {
    const timeDiff = getRecordTimestamp(b.updatedAt || b.createdAt) - getRecordTimestamp(a.updatedAt || a.createdAt);
    if (timeDiff) return timeDiff;
    return String(b.treeNo || "").localeCompare(String(a.treeNo || ""), "zh-Hans-CN");
  });
  const filtered = keyword
    ? sorted.filter((record) => [record.treeNo, record.species, record.plotNo, record.recorder, record.location, record.county, record.town, record.village, record.site]
      .some((value) => String(value || "").toLowerCase().includes(keyword)))
    : sorted;
  const total = filtered.length;
  const startIndex = (page - 1) * pageSize;
  const data = filtered.slice(startIndex, startIndex + pageSize).map((record) => enrichRecord(record, user));
  return ok({ data, page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1), summary });
};

const getTree = async (event) => {
  const user = await getCurrentUser();
  const res = await db.collection(COLLECTION).doc(event.id).get();
  return ok(enrichRecord(res.data, user));
};

const saveTree = async (event) => {
  await ensureCollection();
  const user = await getCurrentUser();
  const wxContext = requireOpenId();
  const record = event.record || {};
  const systemSettings = await ensureSystemConfig();
  record.systemSettings = systemSettings;
  await validateRecord(record, record._id);
  await auditRecord(record);
  const data = normalizeRecord(record, wxContext.OPENID);
  data.auditStatus = "pass";
  data.auditAt = db.serverDate();

  if (record._id) {
    const old = await db.collection(COLLECTION).doc(record._id).get();
    if (!isAdmin(user) && old.data.createdBy !== user.openid) throw new Error("权限不足：只能修改自己录入的档案");
    if (!isAdmin(user)) delete data.reviewStatus;
    await db.collection(COLLECTION).doc(record._id).update({ data });
    return ok({ _id: record._id });
  }

  data.createdAt = db.serverDate();
  data.createdBy = wxContext.OPENID;
  const res = await db.collection(COLLECTION).add({ data });
  return ok({ _id: res._id });
};

const deleteTree = async (event) => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await db.collection(COLLECTION).doc(event.id).remove();
  return ok({ _id: event.id });
};

const countBy = (records, key, preset = []) => {
  const map = preset.reduce((acc, name) => ({ ...acc, [name]: 0 }), {});
  records.forEach((record) => {
    const name = record[key] || "未填写";
    map[name] = (map[name] || 0) + 1;
  });
  const total = records.length || 1;
  return Object.keys(map)
    .map((name) => ({ name, count: map[name], percent: Math.round((map[name] / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"));
};

const statsTrees = async () => {
  await getCurrentUser();
  await ensureCollection();
  const records = await fetchAllCollectionRecords(COLLECTION);
  const plots = new Set(records.map((item) => item.plotNo).filter(Boolean));
  const species = new Set(records.map((item) => item.species).filter(Boolean));
  return ok({
    summary: {
      total: records.length,
      plots: plots.size,
      species: species.size,
      pendingReview: records.filter((item) => item.reviewStatus === "待复核").length,
      abnormal: records.filter((item) => item.healthLevel && item.healthLevel !== "健康").length,
    },
    byHealth: countBy(records, "healthLevel", healthLevels),
    byPlot: countBy(records, "plotNo", [...getPlotNos(), OUTSIDE_FIXED_PLOT_LABEL]),
    bySpecies: countBy(records, "species").slice(0, 20),
  });
};

const escapeCsv = (value) => {
  if (value === undefined || value === null) return "";
  const text = Array.isArray(value) ? value.join(";") : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const exportTrees = async () => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await ensureCollection();
  const records = await fetchAllCollectionRecords(COLLECTION);
  const header = csvHeaders.map(([, label]) => escapeCsv(label)).join(",");
  const rows = records.map((record) => csvHeaders.map(([key]) => {
    if (key === "latitude" || key === "longitude") return escapeCsv(formatCoordinateDms(record[key]));
    return escapeCsv(record[key]);
  }).join(","));
  const csv = "\ufeff" + [header, ...rows].join("\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const upload = await cloud.uploadFile({ cloudPath: `forest-health/exports/tree-records-${stamp}.csv`, fileContent: Buffer.from(csv, "utf8") });
  return ok({ fileID: upload.fileID, count: records.length });
};


const getPestStatusClass = (status) => {
  const text = String(status || "");
  if (text.includes("受理")) return "accepted";
  if (text.includes("办结") || text.includes("完成")) return "closed";
  if (text.includes("驳回")) return "rejected";
  return "pending";
};

const buildPestTitle = (record) => {
  const type = String(record.type || "病害");
  const description = String(record.description || record.title || "").trim();
  const location = String(record.location || "").trim();
  if (description) return description.slice(0, 20);
  if (location) return `${type}：${location}`;
  return `${type}上报`;
};

const normalizePestReport = (record, user) => {
  const images = Array.isArray(record.images) ? record.images : (record.image ? [record.image] : []);
  const status = record.status || record.reviewStatus || "待审核";
  return {
    ...record,
    id: record._id || record.id || record.reportNo,
    reportNo: record.reportNo || record.id || record._id,
    title: record.title || buildPestTitle(record),
    type: record.type || "病害",
    severity: record.severity || "一般",
    status,
    statusClass: record.statusClass || getPestStatusClass(status),
    images,
    image: images[0] || "",
    _canEdit: isAdmin(user) || record.createdBy === user.openid,
    _canDelete: isAdmin(user),
  };
};

const auditPestReport = async (record) => {
  await auditTextContent({
    treeNo: record.reportNo || record.title || "",
    species: record.type || "",
    recorder: record.reporterName || "",
    pestDiseaseDescription: [record.location, record.description, record.remark].filter(Boolean).join("\n"),
    remark: record.title || "",
  });
  await auditImages(record.images || []);
};

const listPestReports = async (event) => {
  await ensurePestCollection();
  const user = await getCurrentUser();
  const pageSize = Math.min(Number(event.pageSize || event.limit || 15), 50);
  const page = Math.max(Number(event.page || 1), 1);
  const filter = String(event.filter || "全部");
  const keyword = String(event.keyword || "").trim().toLowerCase();
  const allRecords = await fetchAllCollectionRecords(PEST_COLLECTION);
  const filtered = allRecords.filter((record) => {
    if ((filter === "病害" || filter === "虫害") && record.type !== filter) return false;
    if (filter === "待处理" && !["待审核", "已受理"].includes(record.status || record.reviewStatus)) return false;
    if (!keyword) return true;
    return [record.title, record.type, record.location, record.description, record.severity, record.status]
      .some((value) => String(value || "").toLowerCase().includes(keyword));
  }).sort((a, b) => getRecordTimestamp(b.updatedAt || b.createdAt) - getRecordTimestamp(a.updatedAt || a.createdAt));
  const total = filtered.length;
  const startIndex = (page - 1) * pageSize;
  const data = filtered.slice(startIndex, startIndex + pageSize).map((record) => normalizePestReport(record, user));
  return ok({
    data,
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    summary: {
      total: allRecords.length,
      pending: allRecords.filter((item) => (item.status || item.reviewStatus) === "待审核").length,
      accepted: allRecords.filter((item) => (item.status || item.reviewStatus) === "已受理").length,
      closed: allRecords.filter((item) => (item.status || item.reviewStatus) === "已办结").length,
    },
  });
};


const validatePestReportInput = (record, images) => {
  const errors = [];
  const types = new Set(["病害", "虫害"]);
  const severities = new Set(["一般", "较急", "紧急"]);
  const sources = new Set(["manual", "gps", "auto", "map", "ancient", ""]);
  const location = String(record.location || "").trim();
  const description = String(record.description || "").trim();
  const latitudeEmpty = record.latitude === "" || record.latitude === undefined || record.latitude === null;
  const longitudeEmpty = record.longitude === "" || record.longitude === undefined || record.longitude === null;
  const checkRange = (value, label, min, max) => {
    if (value === "" || value === undefined || value === null) return;
    const numberValue = (label === "纬度" || label === "经度") ? parseCoordinateValue(value) : Number(value);
    if (!Number.isFinite(numberValue)) errors.push(`${label}必须是数字`);
    else if (numberValue < min || numberValue > max) errors.push(`${label}范围应在${min}到${max}之间`);
  };

  if (!types.has(String(record.type || ""))) errors.push("上报类型无效");
  if (!severities.has(String(record.severity || ""))) errors.push("紧急程度无效");
  if (!location) errors.push("地点不能为空");
  if (["暂无", "待补", "未知", "暂无位置描述"].includes(location)) errors.push("地点不能使用占位文字");
  if (location.length > 200) errors.push("地点不能超过200个字符");
  if (!description) errors.push("症状和现场描述不能为空");
  if (description.length < 5) errors.push("症状和现场描述至少填写5个字符");
  if (description.length > 2000) errors.push("症状和现场描述不能超过2000个字符");
  if (!Array.isArray(images) || images.length === 0) errors.push("现场照片不能为空");
  if (Array.isArray(images) && images.length > 6) errors.push("现场照片最多上传6张");
  if (Array.isArray(images) && images.some((item) => !String(item || "").startsWith("cloud://"))) errors.push("现场照片尚未完成云端上传");
  if (latitudeEmpty !== longitudeEmpty) errors.push("纬度和经度必须同时填写");
  checkRange(record.latitude, "纬度", -90, 90);
  checkRange(record.longitude, "经度", -180, 180);
  checkRange(record.altitude, "海拔", 0, 9000);
  checkRange(record.accuracy, "定位精度", 0, 10000);
  if (!sources.has(String(record.locationSource || ""))) errors.push("定位来源无效");
  if (errors.length) throw new Error(errors.join("；"));
};
const savePestReport = async (event) => {
  await ensurePestCollection();
  const user = await getCurrentUser();
  const wxContext = requireOpenId();
  const report = event.report || {};
  const images = Array.isArray(report.images) && report.images.length ? report.images : (report.image ? [report.image] : []);
  const normalized = {
    type: String(report.type || "").trim(),
    severity: String(report.severity || "").trim(),
    location: String(report.location || "").trim(),
    description: String(report.description || "").trim(),
    title: report.title || buildPestTitle(report),
    images,
    image: images[0] || "",
    recognition: report.recognition || {},
    remark: report.remark || "",
    latitude: report.latitude === "" || report.latitude === undefined || report.latitude === null ? "" : (Number.isFinite(parseCoordinateValue(report.latitude)) ? parseCoordinateValue(report.latitude) : ""),
    longitude: report.longitude === "" || report.longitude === undefined || report.longitude === null ? "" : (Number.isFinite(parseCoordinateValue(report.longitude)) ? parseCoordinateValue(report.longitude) : ""),
    accuracy: report.accuracy === "" || report.accuracy === undefined || report.accuracy === null ? "" : (Number.isFinite(Number(report.accuracy)) ? Number(report.accuracy) : ""),
    altitude: report.altitude === "" || report.altitude === undefined || report.altitude === null ? "" : (Number.isFinite(Number(report.altitude)) ? Number(report.altitude) : ""),
    locationSource: report.locationSource || "manual",
    relatedTreeNo: String(report.relatedTreeNo || "").trim(),
    relatedSpecies: String(report.relatedSpecies || "").trim(),
  };
  validatePestReportInput(normalized, images);
  await auditPestReport(normalized);
  const data = {
    ...normalized,
    status: "待审核",
    reviewStatus: "待审核",
    auditStatus: "pass",
    auditAt: db.serverDate(),
    createdBy: wxContext.OPENID,
    updatedBy: wxContext.OPENID,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
  if (report._id) {
    const old = await db.collection(PEST_COLLECTION).doc(report._id).get();
    if (!isAdmin(user) && old.data.createdBy !== user.openid) throw new Error("权限不足：只能修改自己提交的上报");
    await db.collection(PEST_COLLECTION).doc(report._id).update({ data });
    return ok({ _id: report._id });
  }
  const res = await db.collection(PEST_COLLECTION).add({ data });
  return ok({ _id: res._id });
};

const updatePestReportStatus = async (event) => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await ensurePestCollection();
  const status = String(event.status || "");
  if (!PEST_STATUS.includes(status)) throw new Error("病虫害上报状态无效");
  await db.collection(PEST_COLLECTION).doc(event.id).update({
    data: {
      status,
      reviewStatus: status,
      reviewedBy: user.openid,
      reviewedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return ok({ _id: event.id, status });
};
const seedDemoData = async () => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await ensureCollection();
  const existed = await db.collection(COLLECTION).where({ demo: true }).limit(1).get();
  if (existed.data.length) return ok({ inserted: 0, message: "演示数据已存在" });

  const plotNos = getPlotNos();
  const records = Array.from({ length: 45 }, (_, index) => {
    const no = index + 1;
    const plotNo = plotNos[index % plotNos.length];
    const plotCenter = getPlotCenterLocation(plotNo);
    const species = demoSpecies[index % demoSpecies.length];
    const healthLevel = healthLevels[index % healthLevels.length];
    return {
      demo: true,
      plotNo,
      subplotNo: `${plotNo}-01`,
      treeNo: `${plotNo}-${String(no).padStart(3, "0")}`,
      species,
      latinName: "",
      forestType: index % 2 === 0 ? "次生林" : "人工林",
      weather: ["\u6674", "\u9634", "\u5c0f\u96e8", "\u5927\u96e8"][index % 4],
      plotArea: 400,
      dominantSpecies: species,
      standOrigin: index % 2 === 0 ? "\u4eba\u5de5\u6797" : "\u5929\u7136\u6797",
      investigator: "\u6d4b\u8bd5\u5458",
      recordDate: "2026-07-26",
      recorder: "测试员",
      age: 20 + (index % 60),
      dbh: Number((12 + index * 0.7).toFixed(1)),
      height: Number((5 + index * 0.25).toFixed(1)),
      branchHeight: Number((1.5 + index * 0.05).toFixed(1)),
      crownWidth: Number((2.5 + index * 0.08).toFixed(1)),
      crownWidthNS: Number((2.4 + index * 0.06).toFixed(1)),
      crownWidthEW: Number((2.2 + index * 0.05).toFixed(1)),
      xInPlot: Number(((index * 3.7) % 20).toFixed(1)),
      yInPlot: Number(((index * 5.1) % 20).toFixed(1)),
      crownDensity: Number((0.45 + (index % 5) * 0.08).toFixed(2)),
      growthVigor: index % 5 === 0 ? "较弱" : "正常",
      growthStatus: ["\u5b58\u6d3b", "\u503e\u659c", "\u6298\u65ad", "\u67af\u68a2", "\u67af\u7acb\u6728"][index % 5],
      phenology: ["\u5c55\u53f6\u671f", "\u5f00\u82b1\u671f", "\u7ed3\u5b9e\u671f", "\u843d\u53f6\u671f"][index % 4],
      vitalityLevel: ["I", "II", "III"][index % 3],
      healthLevel,
      pestLevel: index % 7 === 0 ? "轻微" : "无",
      diseaseLevel: index % 9 === 0 ? "轻微" : "无",
      pestDiseaseDescription: index % 7 === 0 ? "\u8f7b\u5fae\u866b\u54ac" : "",
      deadBranchRate: index % 5 === 0 ? 12 : 3,
      hollow: "无",
      leaning: index % 11 === 0 ? "轻微" : "无",
      humanDisturbance: index % 8 === 0 ? "轻微" : "无",
      conservationAction: healthLevel === "健康" ? "持续观察" : "专家复核",
      reviewStatus: "待复核",
      slopeAspect: ["\u9633\u5761", "\u534a\u9633\u5761", "\u9634\u5761", "\u534a\u9634\u5761"][index % 4],
      slopePosition: ["上坡", "中坡", "下坡", "沟谷"][index % 4],
      slopeDegree: Number((12 + (index % 35)).toFixed(1)),
      soilMoisture: ["偏干", "适中", "湿润"][index % 3],
      latitude: plotCenter.latitude,
      longitude: plotCenter.longitude,
      altitude: plotCenter.altitude || 320 + (index % 80),
      remark: "演示数据，用于分页、搜索、地图和照片展示测试。",
      photoNo: `${plotNo}-${String(no).padStart(3, "0")}-P01`,
      images: [`https://picsum.photos/seed/fh-tree-${no}/320/240`],
      auditStatus: "demo",
      createdBy: user.openid,
      updatedBy: user.openid,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    };
  });

  for (let index = 0; index < records.length; index += 1) {
    await db.collection(COLLECTION).add({ data: records[index] });
  }
  return ok({ inserted: records.length });
};

exports.main = async (event) => {
  try {
    switch (event.type) {
      case "getOpenId": return await getOpenId();
      case "loginUser": return await loginUser(event);
      case "getMiniProgramCode": return await getMiniProgramCode();
      case "listUsers": return await listUsers();
      case "updateUserRole": return await updateUserRole(event);
      case "getSystemSettings": return await getSystemSettings();
      case "updateSystemSettings": return await updateSystemSettings(event);
      case "recognizePlant": return await recognizePlant(event);
      case "recognizePest": return await recognizePlant({ ...event, task: "pest" });
      case "updateMyLocation": return await updateMyLocation(event);
      case "setMyLocationOffline": return await setMyLocationOffline();
      case "listUserLocations": return await listUserLocations();
      case "createCollection":
      case "initForestProject": return await initForestProject();
      case "listTrees": return await listTrees(event);
      case "getTree": return await getTree(event);
      case "saveTree": return await saveTree(event);
      case "deleteTree": return await deleteTree(event);
      case "statsTrees": return await statsTrees();
      case "listPestReports": return await listPestReports(event);
      case "savePestReport": return await savePestReport(event);
      case "updatePestReportStatus": return await updatePestReportStatus(event);
      case "exportTrees": return await exportTrees();
      case "seedDemoData": return await seedDemoData();
      default: return fail(`未知操作：${event.type}`);
    }
  } catch (error) {
    console.error(error);
    return fail(error);
  }
};

