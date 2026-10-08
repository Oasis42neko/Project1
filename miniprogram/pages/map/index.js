const treeService = require("../../services/treeService");
const authService = require("../../services/authService");
const { getPlotCenterLocation, getPlotNos, getPlotPolygon, formatCoordinateDms } = require("../../models/plotAreas");

const buildOverviewViewport = () => {
  const plotCenters = getPlotNos().map((plotNo) => {
    const center = getPlotCenterLocation(plotNo);
    if (!center) return null;
    return {
      latitude: Number(center.latitude),
      longitude: Number(center.longitude),
    };
  }).filter(Boolean);

  if (!plotCenters.length) {
    return {
      latitude: 23.84728034,
      longitude: 116.57898334,
      scale: 11,
    };
  }

  const latitudes = plotCenters.map((item) => item.latitude);
  const longitudes = plotCenters.map((item) => item.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const span = Math.max(maxLatitude - minLatitude, maxLongitude - minLongitude);

  let scale = 11;
  if (span < 0.01) scale = 14;
  else if (span < 0.02) scale = 13;
  else if (span < 0.03) scale = 12;
  else if (span < 0.05) scale = 11;
  else scale = 10;

  return {
    latitude: Number(((minLatitude + maxLatitude) / 2).toFixed(8)),
    longitude: Number(((minLongitude + maxLongitude) / 2).toFixed(8)),
    scale,
  };
};

const defaultViewport = buildOverviewViewport();

const plotColors = [
  "#FA5151", "#F97316", "#F59E0B", "#84CC16", "#22C55E",
  "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E",
  "#EF4444", "#FB7185", "#F97316", "#EAB308", "#10B981",
];

const toRadians = (value) => Number(value) * Math.PI / 180;

const distanceMeters = (from, to) => {
  if (!from || !to) return null;
  const lat1 = Number(from.latitude);
  const lon1 = Number(from.longitude);
  const lat2 = Number(to.latitude);
  const lon2 = Number(to.longitude);
  if ([lat1, lon1, lat2, lon2].some((value) => Number.isNaN(value))) return null;
  const radius = 6371000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistance = (meters) => {
  if (meters === null || meters === undefined) return "--";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
};

const colorWithAlpha = (hex, alpha) => `${hex}${alpha}`;

Page({
  data: {
    latitude: defaultViewport.latitude,
    longitude: defaultViewport.longitude,
    scale: defaultViewport.scale,
    markers: [],
    polygons: [],
    polyline: [],
    records: [],
    plotList: [],
    selectedPlot: null,
    myLocation: null,
    myAccuracy: "--",
    targetDistance: "--",
    locating: false,
    locationError: "",
    currentUser: null,
    myAvatarIconPath: "",
  },

  onShow() {
    const user = authService.requireLogin();
    if (!user) return;
    this.setData({ currentUser: user });
    this.prepareMyAvatarIcon(user);
    this.refreshNavigationMap();
  },

  onUnload() {
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
      this.locationTimer = null;
    }
  },

  prepareMyAvatarIcon(user) {
    if (!user || !user.avatarUrl) return;
    wx.downloadFile({
      url: user.avatarUrl,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          this.setData({ myAvatarIconPath: res.tempFilePath }, () => this.refreshDerivedState());
        }
      },
      fail: () => {},
    });
  },

  refreshNavigationMap() {
    this.loadMap();
    this.locateMe(false, false, false);
    if (!this.locationTimer) {
      this.locationTimer = setInterval(() => this.locateMe(false, false, false), 15000);
    }
  },

  buildPlotPolygons() {
    return getPlotNos().map((plotNo, index) => {
      const points = getPlotPolygon(plotNo);
      const color = plotColors[index % plotColors.length];
      return {
        points,
        strokeWidth: 2,
        strokeColor: colorWithAlpha(color, "CC"),
        fillColor: colorWithAlpha(color, "33"),
      };
    });
  },

  buildPlotList() {
    return getPlotNos().map((plotNo, index) => {
      const centerPoint = getPlotCenterLocation(plotNo);
      const distance = distanceMeters(this.data.myLocation, centerPoint);
      return {
        plotNo,
        latitude: centerPoint.latitude,
        longitude: centerPoint.longitude,
        latitudeText: formatCoordinateDms(centerPoint.latitude),
        longitudeText: formatCoordinateDms(centerPoint.longitude),
        color: plotColors[index % plotColors.length],
        distance,
        distanceText: formatDistance(distance),
      };
    }).sort((a, b) => {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
  },

  buildMarkers(records = this.data.records) {
    const plotMarkers = getPlotNos().map((plotNo, index) => {
      const centerPoint = getPlotCenterLocation(plotNo);
      return {
        id: index + 1,
        latitude: centerPoint.latitude,
        longitude: centerPoint.longitude,
        latitudeText: formatCoordinateDms(centerPoint.latitude),
        longitudeText: formatCoordinateDms(centerPoint.longitude),
        width: 34,
        height: 34,
        callout: {
          content: plotNo,
          color: "#FFFFFF",
          fontSize: 12,
          borderRadius: 17,
          bgColor: colorWithAlpha(plotColors[index % plotColors.length], "DD"),
          padding: 8,
          display: "ALWAYS",
        },
      };
    });

    const recordMarkers = records
      .filter((record) => record.latitude && record.longitude)
      .map((record, index) => ({
        id: 1000 + index,
        latitude: Number(record.latitude),
        longitude: Number(record.longitude),
        width: 18,
        height: 18,
        callout: {
          content: `${record.treeNo || "鏍锋爲"}`,
          color: "#24342B",
          fontSize: 11,
          borderRadius: 6,
          bgColor: "#FFFFFF",
          padding: 6,
          display: "BYCLICK",
        },
      }));

    const myMarker = this.data.myLocation ? [{
      id: 9999,
      latitude: this.data.myLocation.latitude,
      longitude: this.data.myLocation.longitude,
      width: 38,
      height: 38,
      ...(this.data.myAvatarIconPath ? { iconPath: this.data.myAvatarIconPath } : {}),
      callout: {
        content: this.data.currentUser && this.data.currentUser.nickName ? this.data.currentUser.nickName : "我",
        color: "#FFFFFF",
        fontSize: 14,
        borderRadius: 18,
        bgColor: "#1677FF",
        padding: 9,
        display: "ALWAYS",
      },
    }] : [];

    return [...plotMarkers, ...recordMarkers, ...myMarker];
  },

  refreshDerivedState() {
    const plotList = this.buildPlotList();
    const selectedPlot = this.data.selectedPlot
      ? plotList.find((item) => item.plotNo === this.data.selectedPlot.plotNo) || this.data.selectedPlot
      : null;
    const polyline = selectedPlot && this.data.myLocation ? [{
      points: [this.data.myLocation, { latitude: selectedPlot.latitude, longitude: selectedPlot.longitude }],
      color: "#1677FFAA",
      width: 4,
      dottedLine: true,
    }] : [];
    this.setData({
      plotList,
      selectedPlot,
      targetDistance: selectedPlot ? selectedPlot.distanceText : "--",
      markers: this.buildMarkers(),
      polyline,
    });
  },

  async loadMap() {
    try {
      const res = await treeService.listTrees({ page: 1, pageSize: 100 });
      const payload = res.data || {};
      const records = Array.isArray(payload.data) ? payload.data : [];
      this.setData({
        records,
        polygons: this.buildPlotPolygons(),
      }, () => this.refreshDerivedState());
    } catch (error) {
      console.error("loadMap failed", error);
      wx.showModal({
        title: "鍦板浘鏁版嵁鍔犺浇澶辫触",
        content: error.message || "请检查云函数是否已部署",
        showCancel: false,
      });
    }
  },

  requestLocationPermission(onGranted) {
    wx.getSetting({
      success: (settings) => {
        const status = settings.authSetting && settings.authSetting["scope.userLocation"];
        if (status === true) {
          onGranted();
          return;
        }
        if (status === undefined) {
          wx.authorize({
            scope: "scope.userLocation",
            success: onGranted,
            fail: () => this.openLocationSettings(),
          });
          return;
        }
        this.openLocationSettings();
      },
      fail: () => this.openLocationSettings(),
    });
  },

  openLocationSettings() {
    wx.showModal({
      title: "需要定位权限",
      content: "请在手机系统中允许微信访问位置，并开启手机定位服务。返回小程序后再点击地图上的“定位”按钮。",
      confirmText: "去设置",
      cancelText: "取消",
      success: (modal) => {
        if (modal.confirm) wx.openSetting();
      },
    });
  },

  locateMe(showLoading = true, shouldCenter = true, requestPermission = true) {
    const withLoading = typeof showLoading === "boolean" ? showLoading : true;
    if (this.data.locating) return;
    const startLocation = () => {
      this.setData({ locating: withLoading });
      wx.getLocation({
        type: "gcj02",
        isHighAccuracy: true,
        highAccuracyExpireTime: 10000,
        success: (res) => {
          const myLocation = {
            latitude: Number(res.latitude),
            longitude: Number(res.longitude),
          };
          const nextData = {
            myLocation,
            myAccuracy: res.accuracy ? `${Math.round(res.accuracy)} m` : "--",
            locationError: "",
          };
          if (shouldCenter) {
            nextData.latitude = myLocation.latitude;
            nextData.longitude = myLocation.longitude;
            nextData.scale = this.data.selectedPlot ? 18 : 16;
          }
          this.setData(nextData, () => this.refreshDerivedState());
          treeService.updateMyLocation({
            latitude: res.latitude,
            longitude: res.longitude,
            altitude: res.altitude || "",
            accuracy: res.accuracy || "",
            source: "navigation",
          }).catch(() => {});
        },
        fail: (error) => {
          const errMsg = String((error && error.errMsg) || "");
          const lowerMsg = errMsg.toLowerCase();
          if (lowerMsg.includes("auth deny") || lowerMsg.includes("authorize") || lowerMsg.includes("permission")) {
            this.setData({ locationError: "微信没有获得定位权限，请点击“定位”后去设置。" });
            this.openLocationSettings();
          } else if (lowerMsg.includes("gps") || lowerMsg.includes("location service") || lowerMsg.includes("system") || lowerMsg.includes("timeout")) {
            this.setData({ locationError: "手机系统定位服务未开启，或当前环境暂时无法获得 GPS。" });
            if (withLoading) wx.showModal({
              title: "获取位置失败",
              content: "请打开手机系统定位服务，并允许微信访问位置后重试。山区、室内或模拟器可能无法获得有效 GPS。",
              showCancel: false,
            });
          } else {
            this.setData({ locationError: errMsg || "暂时无法获得当前位置，请稍后重试。" });
            if (withLoading) wx.showToast({ title: "定位失败，请查看页面提示", icon: "none" });
          }
        },
        complete: () => this.setData({ locating: false }),
      });
    };

    if (requestPermission) {
      this.requestLocationPermission(startLocation);
    } else {
      wx.getSetting({
        success: (settings) => {
          if (settings.authSetting && settings.authSetting["scope.userLocation"] === true) startLocation();
        },
      });
    }
  },

  onLocateTap() {
    this.setData({ locationError: "" });
    this.locateMe(true, true, true);
  },

  onLocationHelpTap() {
    this.openLocationSettings();
  },
  onMarkerTap(event) {
    if (event.markerId >= 1 && event.markerId <= getPlotNos().length) {
      const plotNo = getPlotNos()[event.markerId - 1];
      this.selectPlotByNo(plotNo);
    }
  },

  selectPlot(event) {
    this.selectPlotByNo(event.currentTarget.dataset.plotNo);
  },

  selectPlotByNo(plotNo) {
    const target = this.data.plotList.find((item) => item.plotNo === plotNo);
    if (!target) return;
    this.setData({
      selectedPlot: target,
      latitude: target.latitude,
      longitude: target.longitude,
      scale: 19,
    }, () => this.refreshDerivedState());
  },

  openTargetNavigation() {
    const target = this.data.selectedPlot;
    if (!target) {
      wx.showToast({ title: "璇峰厛閫夋嫨鏍锋柟", icon: "none" });
      return;
    }
    wx.openLocation({
      latitude: Number(target.latitude),
      longitude: Number(target.longitude),
      name: `${target.plotNo} 鏍锋柟涓績`,
      address: `璺濈褰撳墠浣嶇疆绾?${target.distanceText}`,
      scale: 18,
    });
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/form/index" });
  },
});


