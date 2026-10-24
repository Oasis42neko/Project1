const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const {
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
const ANCIENT_COLLECTION = "forest_ancient_trees";
const KNOWLEDGE_COLLECTION = "forest_knowledge_files";
const MESSAGE_COLLECTION = "forest_admin_messages";
const ANCIENT_TREES = require("./data/ancientTrees.json");
const SYSTEM_CONFIG_KEY = "global";
const DEFAULT_SYSTEM_CONFIG = { allowManualLocation: true };
const PEST_STATUS = ["待审核", "已受理", "已办结", "已驳回"];
const healthLevels = ["健康", "轻度异常", "中度异常", "重度异常", "死亡"];
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
const isDemoTreeRecord = (record) => Boolean(record && (record.demo === true || record.auditStatus === "demo"));
const getProductionTreeRecords = (records) => records.filter((record) => !isDemoTreeRecord(record));
const ensureUserCollection = async () => ensureCollectionByName(USER_COLLECTION);
const ensureLocationCollection = async () => ensureCollectionByName(LOCATION_COLLECTION);
const ensureConfigCollection = async () => ensureCollectionByName(CONFIG_COLLECTION);
const ensurePestCollection = async () => ensureCollectionByName(PEST_COLLECTION);
const ensureAncientCollection = async () => ensureCollectionByName(ANCIENT_COLLECTION);
const ensureKnowledgeCollection = async () => ensureCollectionByName(KNOWLEDGE_COLLECTION);
const ensureMessageCollection = async () => ensureCollectionByName(MESSAGE_COLLECTION);

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

const OPERATION_ACTIONS = new Set([
  "login",
  "tree_create",
  "tree_update",
  "tree_delete",
  "pest_create",
  "pest_update",
  "pest_status_update",
  "knowledge_upload",
  "knowledge_download",
  "knowledge_delete",
  "location_gps",
  "location_select",
  "location_plot_center",
  "data_export",
  "ancient_restore",
  "role_update",
  "settings_update",
]);

const trimMessageText = (value, maxLength = 300) => String(value || "").trim().slice(0, maxLength);

const normalizeMessageDetails = (details = {}) => Object.keys(details || {}).reduce((result, key) => {
  const value = details[key];
  if (value === undefined || value === null || typeof value === "function") return result;
  if (["string", "number", "boolean"].includes(typeof value)) {
    result[key] = typeof value === "string" ? trimMessageText(value, 500) : value;
    return result;
  }
  if (Array.isArray(value)) {
    result[key] = value.slice(0, 20).map((item) => trimMessageText(item, 160));
  }
  return result;
}, {});

const createAdminMessage = async ({
  messageType = "operation",
  action,
  title,
  summary,
  targetType = "",
  targetId = "",
  details = {},
  user,
} = {}) => {
  if (!user || !user.openid) return null;
  await ensureMessageCollection();
  const data = {
    messageType,
    action: trimMessageText(action, 60),
    title: trimMessageText(title, 120),
    summary: trimMessageText(summary, 500),
    targetType: trimMessageText(targetType, 60),
    targetId: trimMessageText(targetId, 120),
    details: normalizeMessageDetails(details),
    actorOpenid: user.openid,
    actorName: trimMessageText(user.nickName || "", 80),
    actorPhone: trimMessageText(user.phoneNumber || "", 40),
    createdAt: db.serverDate(),
  };
  const result = await db.collection(MESSAGE_COLLECTION).add({ data });
  return result._id;
};

const safeCreateAdminMessage = async (options) => {
  try {
    return await createAdminMessage(options);
  } catch (error) {
    console.warn("admin message write failed", error && error.message ? error.message : error);
    return null;
  }
};

const logOperation = async (event) => {
  const user = await getCurrentUser();
  const action = trimMessageText(event.action, 60);
  if (!OPERATION_ACTIONS.has(action)) throw new Error("操作记录类型无效");
  await safeCreateAdminMessage({
    action,
    title: event.title || action,
    summary: event.summary || "",
    targetType: event.targetType || "",
    targetId: event.targetId || "",
    details: event.details || {},
    user,
  });
  return ok({ logged: true });
};

const getOpenId = async () => {
  const wxContext = requireOpenId();
  return ok({ openid: wxContext.OPENID, appid: wxContext.APPID, unionid: wxContext.UNIONID });
};

const maskPhoneNumber = (value) => {
  const phone = String(value || "");
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "";
};

const loginUser = async (event) => {
  await ensureUserCollection();
  const wxContext = requireOpenId();
  const profile = event.profile || {};
  const loginMethod = event.loginMethod === "phone" ? "phone" : "wechat";
  let phoneNumber = "";
  if (loginMethod === "phone") {
    const code = String(event.phoneCode || "").trim();
    if (!code) throw new Error("请先授权使用手机号快捷登录");
    const result = await cloud.openapi.phonenumber.getPhoneNumber({ code });
    const info = result && (result.phoneInfo || result);
    phoneNumber = String(info && (info.phoneNumber || info.purePhoneNumber) || "").trim();
    if (!phoneNumber) throw new Error("微信未返回已验证的手机号，请重新授权");
    const phoneOwner = await db.collection(USER_COLLECTION).where({ phoneNumber }).limit(1).get();
    if (phoneOwner.data.length && phoneOwner.data[0].openid !== wxContext.OPENID) {
      throw new Error("此手机号已绑定另一个微信账号");
    }
  }
  const existed = await db.collection(USER_COLLECTION).where({ openid: wxContext.OPENID }).limit(1).get();
  const initialAdmins = String(process.env.INITIAL_ADMIN_OPENIDS || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const baseData = {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID || "",
    nickName: profile.nickName || "",
    avatarUrl: profile.avatarUrl || "",
    lastLoginMethod: loginMethod,
    lastLoginAt: db.serverDate(),
  };
  if (phoneNumber) baseData.phoneNumber = phoneNumber;

  if (existed.data.length) {
    const role = existed.data[0].role || "recorder";
    await db.collection(USER_COLLECTION).doc(existed.data[0]._id).update({ data: { ...baseData, role } });
    const user = { ...existed.data[0], ...baseData, role, _id: existed.data[0]._id };
    await safeCreateAdminMessage({ action: "login", title: "用户登录", summary: `${loginMethod === "phone" ? "手机号" : "微信"}登录`, user });
    return ok({
      _id: user._id,
      openid: user.openid,
      appid: user.appid,
      unionid: user.unionid,
      nickName: user.nickName,
      avatarUrl: user.avatarUrl,
      role,
      phoneMasked: maskPhoneNumber(user.phoneNumber),
    });
  }

  const role = initialAdmins.includes(wxContext.OPENID) ? "admin" : "recorder";
  const userData = { ...baseData, role, createdAt: db.serverDate() };
  const created = await db.collection(USER_COLLECTION).add({ data: userData });
  const user = { _id: created._id, ...userData };
  await safeCreateAdminMessage({ action: "login", title: "新用户登录", summary: `${loginMethod === "phone" ? "手机号" : "微信"}登录并创建账号`, user });
  return ok({
    _id: created._id,
    openid: user.openid,
    appid: user.appid,
    unionid: user.unionid,
    nickName: user.nickName,
    avatarUrl: user.avatarUrl,
    role,
    phoneMasked: maskPhoneNumber(user.phoneNumber),
  });
};

const listUsers = async () => {
  const currentUser = await getCurrentUser();
  ensureAdmin(currentUser);
  await ensureCollection();
  const [usersRes, recordsRes] = await Promise.all([
    db.collection(USER_COLLECTION).orderBy("lastLoginAt", "desc").limit(200).get(),
    db.collection(COLLECTION).limit(1000).get(),
  ]);
  const recordCounts = getProductionTreeRecords(recordsRes.data).reduce((counts, record) => {
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
    phoneMasked: maskPhoneNumber(user.phoneNumber),
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
  await createAdminMessage({
    action: "role_update",
    title: "用户权限调整",
    summary: `角色调整为${role === "admin" ? "管理员" : "普通用户"}`,
    targetType: "user",
    targetId: target.data.openid,
    user: currentUser,
  });
  return ok({ _id: userId, role });
};

const formatMessageTime = (value) => {
  const timestamp = getRecordTimestamp(value);
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const saveAncientIssue = async (event) => {
  const user = await getCurrentUser();
  const issue = event.issue || {};
  const treeNo = trimMessageText(issue.treeNo, 120);
  const species = trimMessageText(issue.species, 120);
  const issueType = trimMessageText(issue.issueType, 60) || "健康异常";
  const severity = trimMessageText(issue.severity, 30) || "一般";
  const description = trimMessageText(issue.description, 2000);
  const remark = trimMessageText(issue.remark, 1000);
  const location = trimMessageText(issue.location, 300);
  if (!treeNo) throw new Error("缺少古树编号");
  if (!description || description.length < 5) throw new Error("异常情况至少填写5个字符");
  if (!location) throw new Error("古树位置不能为空");
  await auditTextContent({
    treeNo,
    species,
    recorder: user.nickName || "",
    pestDiseaseDescription: description,
    remark,
  });
  const details = {
    reportNo: `ATI-${Date.now()}-${String(treeNo).slice(-8)}`,
    treeNo,
    species,
    issueType,
    severity,
    location,
    latitude: issue.latitude === "" ? "" : Number(issue.latitude),
    longitude: issue.longitude === "" ? "" : Number(issue.longitude),
    description,
    remark,
    status: "待处理",
  };
  const id = await createAdminMessage({
    messageType: "ancientIssue",
    action: "ancient_issue_create",
    title: `${treeNo} 古树异常上报`,
    summary: `${issueType} · ${severity} · ${description.slice(0, 80)}`,
    targetType: "ancientTree",
    targetId: treeNo,
    details,
    user,
  });
  return ok({ _id: id, reportNo: details.reportNo });
};

const listAdminMessages = async (event) => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await ensureMessageCollection();
  const messageType = ["operation", "ancientIssue"].includes(String(event.messageType)) ? String(event.messageType) : "operation";
  const keyword = String(event.keyword || "").trim().toLowerCase();
  const pageSize = Math.min(Math.max(Number(event.pageSize || 20), 1), 50);
  const page = Math.max(Number(event.page || 1), 1);
  const all = await fetchAllCollectionRecords(MESSAGE_COLLECTION);
  const filtered = all.filter((item) => {
    if (item.messageType !== messageType) return false;
    if (!keyword) return true;
    const searchable = [item.title, item.summary, item.actorName, item.actorPhone, item.action, item.targetId, JSON.stringify(item.details || {})]
      .join(" ").toLowerCase();
    return searchable.includes(keyword);
  }).sort((a, b) => getRecordTimestamp(b.createdAt) - getRecordTimestamp(a.createdAt));
  const start = (page - 1) * pageSize;
  return ok({
    data: filtered.slice(start, start + pageSize).map((item) => ({
      ...item,
      id: item._id,
      createdAtText: formatMessageTime(item.createdAt),
    })),
    page,
    pageSize,
    total: filtered.length,
    totalPages: Math.max(Math.ceil(filtered.length / pageSize), 1),
  });
};

const exportAdminMessages = async (event) => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await ensureMessageCollection();
  const messageType = ["operation", "ancientIssue"].includes(String(event.messageType)) ? String(event.messageType) : "operation";
  const all = await fetchAllCollectionRecords(MESSAGE_COLLECTION);
  const records = all.filter((item) => item.messageType === messageType)
    .sort((a, b) => getRecordTimestamp(b.createdAt) - getRecordTimestamp(a.createdAt));
  const headers = messageType === "ancientIssue"
    ? ["上报编号", "古树编号", "树种", "异常类型", "紧急程度", "地点", "纬度", "经度", "异常描述", "备注", "状态", "提交人", "提交时间"]
    : ["操作类型", "操作标题", "操作摘要", "对象类型", "对象编号", "操作人", "操作时间", "详情"];
  const rows = records.map((item) => {
    if (messageType === "ancientIssue") {
      const details = item.details || {};
      return [details.reportNo, details.treeNo, details.species, details.issueType, details.severity, details.location, details.latitude, details.longitude, details.description, details.remark, details.status, item.actorName || item.actorOpenid, formatMessageTime(item.createdAt)];
    }
    return [item.action, item.title, item.summary, item.targetType, item.targetId, item.actorName || item.actorOpenid, formatMessageTime(item.createdAt), JSON.stringify(item.details || {})];
  }).map((row) => row.map(escapeCsv).join(","));
  const csv = "\ufeff" + [headers.map(escapeCsv).join(","), ...rows].join("\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = messageType === "ancientIssue" ? "ancient-issues" : "operation-messages";
  const upload = await cloud.uploadFile({
    cloudPath: `forest-health/exports/${path}-${stamp}.csv`,
    fileContent: Buffer.from(csv, "utf8"),
  });
  await createAdminMessage({
    action: "data_export",
    title: messageType === "ancientIssue" ? "导出古树异常" : "导出操作记录",
    summary: `导出 ${records.length} 条记录`,
    targetType: "adminMessages",
    targetId: messageType,
    details: { messageType, count: records.length },
    user,
  });
  return ok({ fileID: upload.fileID, count: records.length });
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
  await safeCreateAdminMessage({
    action: "settings_update",
    title: "更新系统设置",
    summary: settings.allowManualLocation ? "允许手动定位" : "关闭手动定位",
    targetType: "systemSettings",
    targetId: SYSTEM_CONFIG_KEY,
    details: { allowManualLocation: settings.allowManualLocation },
    user,
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
  await ensureAncientCollection();
  await ensureKnowledgeCollection();
  await ensureSystemConfig();
  return ok({ collection: COLLECTION, userCollection: USER_COLLECTION, locationCollection: LOCATION_COLLECTION, configCollection: CONFIG_COLLECTION, pestCollection: PEST_COLLECTION, ancientCollection: ANCIENT_COLLECTION, knowledgeCollection: KNOWLEDGE_COLLECTION });
};

const listTrees = async (event) => {
  await ensureCollection();
  const user = await getCurrentUser();
  const pageSize = Math.min(Number(event.pageSize || event.limit || 15), 50);
  const page = Math.max(Number(event.page || 1), 1);
  const keyword = String(event.keyword || "").trim().toLowerCase();
  const allRecords = getProductionTreeRecords(await fetchAllCollectionRecords(COLLECTION));
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

const ancientLevelValue = (filter) => {
  const text = String(filter || "").trim();
  if (!text || text === "全部") return "";
  return text.endsWith("古树") ? text.slice(0, -2) : text;
};

const listAncientTrees = async (event) => {
  const user = await getCurrentUser();
  const pageSize = Math.min(Number(event.pageSize || event.limit || 15), 50);
  const page = Math.max(Number(event.page || 1), 1);
  const keyword = String(event.keyword || "").trim().toLowerCase();
  const level = ancientLevelValue(event.level);
  // The official catalog is bundled with the function so the page works immediately
  // after a cloud-environment reset; database restoration remains optional.
  const allRecords = ANCIENT_TREES;
  const summary = allRecords.reduce((acc, record) => {
    acc.total += 1;
    if (record.latitude !== null && record.latitude !== undefined && record.longitude !== null && record.longitude !== undefined) acc.withCoordinates += 1;
    else acc.withoutCoordinates += 1;
    return acc;
  }, { total: 0, withCoordinates: 0, withoutCoordinates: 0 });
  const filtered = allRecords
    .filter((record) => !level || record.level === level)
    .filter((record) => !keyword || [record.treeNo, record.species, record.alias, record.location, record.county, record.town, record.village, record.site]
      .some((value) => String(value || "").toLowerCase().includes(keyword)))
    .sort((a, b) => String(a.treeNo || a._id || "").localeCompare(String(b.treeNo || b._id || ""), "zh-Hans-CN"));
  const total = filtered.length;
  const startIndex = (page - 1) * pageSize;
  const data = filtered.slice(startIndex, startIndex + pageSize).map((record) => enrichRecord(record, user));
  return ok({ data, page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1), summary });
};

const getAncientTree = async (event) => {
  const user = await getCurrentUser();
  const id = String(event.id || event.treeNo || "").trim();
  if (!id) throw new Error("缺少古树编号");
  const bundled = ANCIENT_TREES.find((record) => String(record.id || record.treeNo) === id);
  if (bundled) return ok(enrichRecord(bundled, user));
  await ensureAncientCollection();
  const res = await db.collection(ANCIENT_COLLECTION).doc(id).get();
  return ok(enrichRecord(res.data, user));
};

const importAncientTrees = async (event) => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await ensureAncientCollection();
  const offset = Math.max(Number(event.offset || 0), 0);
  const limit = Math.min(Math.max(Number(event.limit || 50), 1), 50);
  const batch = ANCIENT_TREES.slice(offset, offset + limit);
  await Promise.all(batch.map((record) => {
    const treeNo = String(record.treeNo || record.id || "").trim();
    if (!treeNo) return null;
    return db.collection(ANCIENT_COLLECTION).doc(treeNo).set({
      data: {
        ...record,
        id: treeNo,
        treeNo,
        source: record.source || "ancient-trees-202608",
        restoredAt: db.serverDate(),
        restoredBy: user.openid,
      },
    });
  }).filter(Boolean));
  const nextOffset = offset + batch.length;
  await safeCreateAdminMessage({
    action: "ancient_restore",
    title: "恢复古树名木数据",
    summary: "恢复批次 " + (offset + 1) + "-" + nextOffset + "，共 " + batch.length + " 条",
    targetType: "ancientTree",
    targetId: String(offset),
    details: { offset, nextOffset, inserted: batch.length, total: ANCIENT_TREES.length },
    user,
  });
  return ok({
    inserted: batch.length,
    offset,
    nextOffset,
    total: ANCIENT_TREES.length,
    done: nextOffset >= ANCIENT_TREES.length,
  });
};

const normalizeKnowledgeFile = (record) => ({
  ...record,
  id: record._id || record.id,
  name: String(record.name || record.fileName || "未命名文件").trim(),
  category: String(record.category || "其他").trim(),
  description: String(record.description || "").trim(),
  fileID: String(record.fileID || "").trim(),
});

const listKnowledgeFiles = async (event) => {
  await ensureKnowledgeCollection();
  await getCurrentUser();
  const pageSize = Math.min(Number(event.pageSize || event.limit || 20), 50);
  const page = Math.max(Number(event.page || 1), 1);
  const keyword = String(event.keyword || "").trim().toLowerCase();
  const category = String(event.category || "全部").trim();
  const allFiles = await fetchAllCollectionRecords(KNOWLEDGE_COLLECTION);
  const filtered = allFiles
    .filter((file) => category === "全部" || !category || file.category === category)
    .filter((file) => !keyword || [file.name, file.category, file.description]
      .some((value) => String(value || "").toLowerCase().includes(keyword)))
    .sort((a, b) => getRecordTimestamp(b.updatedAt || b.createdAt) - getRecordTimestamp(a.updatedAt || a.createdAt));
  const total = filtered.length;
  const startIndex = (page - 1) * pageSize;
  return ok({
    data: filtered.slice(startIndex, startIndex + pageSize).map(normalizeKnowledgeFile),
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    categories: [...new Set(allFiles.map((file) => file.category).filter(Boolean))].sort(),
  });
};

const saveKnowledgeFile = async (event) => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await ensureKnowledgeCollection();
  const file = event.file || {};
  const fileID = String(file.fileID || "").trim();
  const name = String(file.name || file.fileName || "").trim();
  const category = String(file.category || "其他").trim();
  const description = String(file.description || "").trim();
  if (!fileID.startsWith("cloud://")) throw new Error("文件尚未上传到云存储");
  if (!name) throw new Error("文件名称不能为空");
  if (name.length > 120) throw new Error("文件名称不能超过120个字符");
  if (category.length > 40) throw new Error("文件分类不能超过40个字符");
  if (description.length > 300) throw new Error("文件说明不能超过300个字符");
  const data = {
    name,
    category,
    description,
    fileID,
    createdBy: user.openid,
    updatedBy: user.openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
  if (file._id) {
    await db.collection(KNOWLEDGE_COLLECTION).doc(file._id).update({ data });
    await safeCreateAdminMessage({
      action: "knowledge_upload",
      title: "更新知识库文件",
      summary: name,
      targetType: "knowledgeFile",
      targetId: file._id,
      details: { category, fileName: name },
      user,
    });
    return ok({ _id: file._id });
  }
  const created = await db.collection(KNOWLEDGE_COLLECTION).add({ data });
  await safeCreateAdminMessage({
    action: "knowledge_upload",
    title: "上传知识库文件",
    summary: name,
    targetType: "knowledgeFile",
    targetId: created._id,
    details: { category, fileName: name },
    user,
  });
  return ok({ _id: created._id });
};

const deleteKnowledgeFile = async (event) => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await ensureKnowledgeCollection();
  const id = String(event.id || "").trim();
  if (!id) throw new Error("缺少文件编号");
  const old = await db.collection(KNOWLEDGE_COLLECTION).doc(id).get();
  if (old.data && old.data.fileID && String(old.data.fileID).startsWith("cloud://")) {
    try {
      await cloud.deleteFile({ fileList: [old.data.fileID] });
    } catch (error) {
      console.warn("knowledge file storage delete failed", error && error.message ? error.message : error);
    }
  }
  await db.collection(KNOWLEDGE_COLLECTION).doc(id).remove();
  await safeCreateAdminMessage({
    action: "knowledge_delete",
    title: "删除知识库文件",
    summary: old.data && old.data.name ? old.data.name : id,
    targetType: "knowledgeFile",
    targetId: id,
    details: { fileName: old.data && old.data.name ? old.data.name : "" },
    user,
  });
  return ok({ _id: id });
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
    await safeCreateAdminMessage({
      action: "tree_update",
      title: "修改树木档案",
      summary: data.treeNo || record._id,
      targetType: "tree",
      targetId: record._id,
      details: { treeNo: data.treeNo || "", plotNo: data.plotNo || "" },
      user,
    });
    return ok({ _id: record._id });
  }

  data.createdAt = db.serverDate();
  data.createdBy = wxContext.OPENID;
  const res = await db.collection(COLLECTION).add({ data });
  await safeCreateAdminMessage({
    action: "tree_create",
    title: "新增树木档案",
    summary: data.treeNo || res._id,
    targetType: "tree",
    targetId: res._id,
    details: { treeNo: data.treeNo || "", plotNo: data.plotNo || "" },
    user,
  });
  return ok({ _id: res._id });
};

const deleteTree = async (event) => {
  const user = await getCurrentUser();
  ensureAdmin(user);
  await db.collection(COLLECTION).doc(event.id).remove();
  await safeCreateAdminMessage({
    action: "tree_delete",
    title: "删除树木档案",
    summary: String(event.id || ""),
    targetType: "tree",
    targetId: String(event.id || ""),
    user,
  });
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
  const records = getProductionTreeRecords(await fetchAllCollectionRecords(COLLECTION));
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
  const records = getProductionTreeRecords(await fetchAllCollectionRecords(COLLECTION));
  const header = csvHeaders.map(([, label]) => escapeCsv(label)).join(",");
  const rows = records.map((record) => csvHeaders.map(([key]) => {
    if (key === "latitude" || key === "longitude") return escapeCsv(formatCoordinateDms(record[key]));
    return escapeCsv(record[key]);
  }).join(","));
  const csv = "\ufeff" + [header, ...rows].join("\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const upload = await cloud.uploadFile({ cloudPath: `forest-health/exports/tree-records-${stamp}.csv`, fileContent: Buffer.from(csv, "utf8") });
  await safeCreateAdminMessage({
    action: "data_export",
    title: "导出树木档案",
    summary: "导出 " + records.length + " 条树木档案",
    targetType: "tree",
    targetId: "tree-records",
    details: { count: records.length, fileID: upload.fileID },
    user,
  });
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
    await safeCreateAdminMessage({
      action: "pest_update",
      title: "修改病虫害上报",
      summary: normalized.title,
      targetType: "pestReport",
      targetId: report._id,
      details: { type: normalized.type, location: normalized.location },
      user,
    });
    return ok({ _id: report._id });
  }
  const res = await db.collection(PEST_COLLECTION).add({ data });
  await safeCreateAdminMessage({
    action: "pest_create",
    title: "新增病虫害上报",
    summary: normalized.title,
    targetType: "pestReport",
    targetId: res._id,
    details: { type: normalized.type, location: normalized.location },
    user,
  });
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
  await safeCreateAdminMessage({
    action: "pest_status_update",
    title: "更新病虫害上报状态",
    summary: status,
    targetType: "pestReport",
    targetId: String(event.id || ""),
    details: { status },
    user,
  });
  return ok({ _id: event.id, status });
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
      case "logOperation": return await logOperation(event);
      case "saveAncientIssue": return await saveAncientIssue(event);
      case "listAdminMessages": return await listAdminMessages(event);
      case "exportAdminMessages": return await exportAdminMessages(event);
      case "updateMyLocation": return await updateMyLocation(event);
      case "setMyLocationOffline": return await setMyLocationOffline();
      case "listUserLocations": return await listUserLocations();
      case "createCollection":
      case "initForestProject": return await initForestProject();
      case "listTrees": return await listTrees(event);
      case "listAncientTrees": return await listAncientTrees(event);
      case "getAncientTree": return await getAncientTree(event);
      case "importAncientTrees": return await importAncientTrees(event);
      case "listKnowledgeFiles": return await listKnowledgeFiles(event);
      case "saveKnowledgeFile": return await saveKnowledgeFile(event);
      case "deleteKnowledgeFile": return await deleteKnowledgeFile(event);
      case "getTree": return await getTree(event);
      case "saveTree": return await saveTree(event);
      case "deleteTree": return await deleteTree(event);
      case "statsTrees": return await statsTrees();
      case "listPestReports": return await listPestReports(event);
      case "savePestReport": return await savePestReport(event);
      case "updatePestReportStatus": return await updatePestReportStatus(event);
      case "exportTrees": return await exportTrees();
      default: return fail(`未知操作：${event.type}`);
    }
  } catch (error) {
    console.error(error);
    return fail(error);
  }
};
