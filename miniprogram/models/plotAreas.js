const PLOT_SIZE_METERS = 20;
const HALF_SIZE_METERS = PLOT_SIZE_METERS / 2;
const OUTSIDE_FIXED_PLOT_LABEL = "\u56fa\u5b9a\u6837\u65b9\u4ee5\u5916\u533a\u57df";
const SOURCE_COORDINATE_SYSTEM = "WGS84";
const MAP_COORDINATE_SYSTEM = "GCJ-02";

const { parseCoordinateValue, formatCoordinateDecimal, formatCoordinateDms } = require("../utils/coordinateUtils");

// Source: merged KML 20260812175554. sourceName keeps the original KML plot label.
const plotSourceRows = [
  ["FH-01", "\u6837\u5730\u4e00", 23.841061, 116.5949741, 395.07],
  ["FH-02", "\u6837\u5730\u4e8c", 23.8419591, 116.5890943, 379.64],
  ["FH-03", "\u6837\u5730\u4e09", 23.8760247, 116.606936, 584.70],
  ["FH-04", "\u6837\u5730\u56db", 23.880298, 116.6046475, 602.99],
  ["FH-05", "\u6837\u5730\u4e94", 23.8539171, 116.5851733, 343.04],
  ["FH-06", "\u6837\u5730\u516d", 23.850941, 116.5840488, 315.66],
  ["FH-07", "\u6837\u5730\u4e03", 23.8753642, 116.5908373, 531.07],
  ["FH-08", "\u6837\u5730\u516b", 23.8780559, 116.5915608, 538.88],
  ["FH-09", "\u6837\u5730\u4e5d", 23.8612105, 116.5982767, 466.17],
  ["FH-10", "\u6837\u573010", 23.8717033, 116.5771465, 367.08],
  ["FH-11", "\u6837\u5730\u5341\u4e00", 23.8542059, 116.5927536, 354.21],
  ["FH-12", "\u6837\u5730\u5341\u4e8c", 23.8503554, 116.5770042, 383.61],
  ["FH-13", "\u6837\u5730\u5341\u4e09", 23.8691412, 116.6074041, 561.82],
  ["FH-14", "\u6837\u5730\u5341\u56db", 23.8847837, 116.5989031, 596.94],
  ["FH-15", "\u6837\u5730\u5341\u4e94", 23.8569469, 116.6159163, 517.55],
  ["FH-16", "\u6837\u5730\u5341\u516d", 23.8500832, 116.6119446, 513.47],
  ["FH-17", "\u6837\u5730\u5341\u4e03", 23.8563063, 116.5829917, 310.88],
  ["FH-18", "\u6837\u5730\u5341\u516b", 23.8509235, 116.5810982, 360.94],
  ["FH-19", "\u6837\u5730\u5341\u4e5d", 23.8719667, 116.5794103, 371.14],
  ["FH-20", "\u6837\u5730\u4e8c\u5341", 23.8723901, 116.578984, 366.69],
];

const PI = Math.PI;
const EARTH_SEMI_MAJOR_AXIS = 6378245.0;
const ECCENTRICITY_SQUARED = 0.00669342162296594323;

const toNumber = (value) => parseCoordinateValue(value);

const outOfChina = (latitude, longitude) => longitude < 72.004
  || longitude > 137.8347
  || latitude < 0.8293
  || latitude > 55.8271;

const transformLatitude = (x, y) => -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y
  + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  + ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  + ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0
  + ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;

const transformLongitude = (x, y) => 300.0 + x + 2.0 * y + 0.1 * x * x
  + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  + ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  + ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0
  + ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;

const wgs84ToGcj02 = (latitude, longitude) => {
  if (outOfChina(latitude, longitude)) return { latitude, longitude };
  let dLat = transformLatitude(longitude - 105.0, latitude - 35.0);
  let dLng = transformLongitude(longitude - 105.0, latitude - 35.0);
  const radLat = (latitude / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - ECCENTRICITY_SQUARED * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((EARTH_SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((EARTH_SEMI_MAJOR_AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return {
    latitude: Number((latitude + dLat).toFixed(8)),
    longitude: Number((longitude + dLng).toFixed(8)),
  };
};

const toMapCoordinate = (latitude, longitude) => {
  if (SOURCE_COORDINATE_SYSTEM === MAP_COORDINATE_SYSTEM) return { latitude, longitude };
  return wgs84ToGcj02(latitude, longitude);
};

const metersToLatitudeDelta = (meters) => meters / 111320;

const metersToLongitudeDelta = (meters, latitude) => {
  const latitudeRadians = Number(latitude) * Math.PI / 180;
  const metersPerDegree = 111320 * Math.cos(latitudeRadians);
  return metersPerDegree > 0 ? meters / metersPerDegree : 0;
};

const plotSources = plotSourceRows.map(([plotNo, sourceName, sourceLatitude, sourceLongitude, sourceAltitude]) => ({
  plotNo,
  sourceName,
  sourceLatitude,
  sourceLongitude,
  sourceAltitude,
}));

const buildPlotArea = (source) => {
  const center = {
    ...toMapCoordinate(source.sourceLatitude, source.sourceLongitude),
    altitude: source.sourceAltitude,
  };
  const latDelta = metersToLatitudeDelta(HALF_SIZE_METERS);
  const lngDelta = metersToLongitudeDelta(HALF_SIZE_METERS, center.latitude);
  return {
    plotNo: source.plotNo,
    sourceName: source.sourceName,
    sizeMeters: PLOT_SIZE_METERS,
    coordinateSystem: MAP_COORDINATE_SYSTEM,
    altitude: source.sourceAltitude,
    center,
    sourceCenter: {
      latitude: source.sourceLatitude,
      longitude: source.sourceLongitude,
      altitude: source.sourceAltitude,
      coordinateSystem: SOURCE_COORDINATE_SYSTEM,
    },
    minLatitude: center.latitude - latDelta,
    maxLatitude: center.latitude + latDelta,
    minLongitude: center.longitude - lngDelta,
    maxLongitude: center.longitude + lngDelta,
  };
};

const plotAreas = plotSources.reduce((areas, source) => {
  areas[source.plotNo] = buildPlotArea(source);
  return areas;
}, {});

const getPlotNos = () => Object.keys(plotAreas).sort();

const getPlotArea = (plotNo) => plotAreas[plotNo] || null;

const getPlotCenterLocation = (plotNo) => {
  const area = getPlotArea(plotNo);
  if (!area) return null;
  return {
    latitude: area.center.latitude,
    longitude: area.center.longitude,
    altitude: area.center.altitude,
  };
};

const getPlotPolygon = (plotNo) => {
  const area = getPlotArea(plotNo);
  if (!area) return [];
  return [
    { latitude: area.minLatitude, longitude: area.minLongitude },
    { latitude: area.maxLatitude, longitude: area.minLongitude },
    { latitude: area.maxLatitude, longitude: area.maxLongitude },
    { latitude: area.minLatitude, longitude: area.maxLongitude },
  ];
};

const formatCoord = (value) => formatCoordinateDecimal(value, 6);

const getPlotRangeText = (plotNo) => {
  const area = getPlotArea(plotNo);
  if (!area) return "";
  return `\u7eac\u5ea6 ${formatCoord(area.minLatitude)} ~ ${formatCoord(area.maxLatitude)}\uff0c\u7ecf\u5ea6 ${formatCoord(area.minLongitude)} ~ ${formatCoord(area.maxLongitude)}`;
};

const isPointInPlotArea = (plotNo, latitude, longitude) => {
  const area = getPlotArea(plotNo);
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  if (!area || Number.isNaN(lat) || Number.isNaN(lng)) return false;
  return lat >= area.minLatitude
    && lat <= area.maxLatitude
    && lng >= area.minLongitude
    && lng <= area.maxLongitude;
};

const getPlotMatchStatus = (plotNo, latitude, longitude) => {
  if (!plotNo) return { state: "noPlot" };
  const area = getPlotArea(plotNo);
  if (!area) return { state: "missingArea", plotNo };
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { state: "noLocation", plotNo, area };
  return isPointInPlotArea(plotNo, lat, lng)
    ? { state: "matched", plotNo, area }
    : { state: "mismatch", plotNo, area };
};

module.exports = {
  MAP_COORDINATE_SYSTEM,
  OUTSIDE_FIXED_PLOT_LABEL,
  PLOT_SIZE_METERS,
  SOURCE_COORDINATE_SYSTEM,
  getPlotArea,
  getPlotCenterLocation,
  getPlotMatchStatus,
  getPlotNos,
  getPlotPolygon,
  getPlotRangeText,
  isPointInPlotArea,
  plotAreas,
  plotSources,
  parseCoordinateValue,
  formatCoordinateDecimal,
  formatCoordinateDms,
};
