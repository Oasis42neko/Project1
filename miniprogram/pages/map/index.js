const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

const center = {
  latitude: 23.958,
  longitude: 116.637,
};

Page({
  data: {
    latitude: center.latitude,
    longitude: center.longitude,
    scale: 13,
    markers: [],
    records: [],
    selected: null,
  },

  onShow() {
    if (!authService.requireLogin()) return;
    this.loadMap();
  },

  async loadMap() {
    try {
      const res = await treeService.listTrees({ limit: 100 });
      const records = res.data || [];
      const markers = records
        .filter((record) => record.latitude && record.longitude)
        .map((record, index) => ({
          id: index + 1,
          latitude: Number(record.latitude),
          longitude: Number(record.longitude),
          title: `${record.treeNo} ${record.species}`,
          width: 28,
          height: 28,
          callout: {
            content: `${record.treeNo}｜${record.species}\n${record.healthLevel}`,
            color: "#24342B",
            fontSize: 12,
            borderRadius: 6,
            bgColor: "#FFFFFF",
            padding: 8,
            display: "BYCLICK",
          },
        }));
      this.setData({ records, markers });
    } catch (error) {
      wx.showToast({ title: "地图数据加载失败", icon: "none" });
    }
  },

  onMarkerTap(event) {
    const marker = this.data.markers.find((item) => item.id === event.markerId);
    const selected = marker
      ? this.data.records.find((record) => Number(record.latitude) === marker.latitude && Number(record.longitude) === marker.longitude)
      : null;
    this.setData({ selected });
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/form/index" });
  },

  editSelected() {
    if (!this.data.selected) return;
    wx.navigateTo({ url: `/pages/form/index?id=${this.data.selected._id}` });
  },

  openSelectedLocation() {
    const selected = this.data.selected;
    if (!selected || !selected.latitude || !selected.longitude) return;
    wx.openLocation({
      latitude: Number(selected.latitude),
      longitude: Number(selected.longitude),
      name: `${selected.treeNo} ${selected.species}`,
      address: `${selected.plotNo} / ${selected.healthLevel}`,
      scale: 16,
    });
  },
});
