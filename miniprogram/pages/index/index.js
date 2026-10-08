const authService = require("../../services/authService");

Page({
  data: {
    banners: [
      { image: "/assets/home/fenghuang-mountain.jpg", kicker: "凤凰山森林健康观测", title: "记录每一片森林的变化", subtitle: "从样方调查开始，建立森林健康档案" },
      { image: "/assets/home/ancient-tree.jpg", kicker: "潮州古树名木健康观测", title: "让古树拥有自己的数字档案", subtitle: "逐株记录，长期追踪" },
      { image: "/assets/home/forest-pest.jpg", kicker: "林业病虫害观测", title: "发现异常，及时上报", subtitle: "照片、位置和症状信息一并留存" },
    ],
    modules: [
      { key: "forest", number: "01", title: "\u51e4\u51f0\u5c71\u68ee\u6797\n\u5065\u5eb7\u89c2\u6d4b", image: "/assets/home/fenghuang-mountain.jpg" },
      { key: "ancient", number: "02", title: "\u53e4\u6811\u540d\u6728\n\u5065\u5eb7\u89c2\u6d4b", image: "/assets/home/ancient-tree.jpg" },
      { key: "pest", number: "03", title: "\u6797\u4e1a\u75c5\u866b\n\u5bb3\u89c2\u6d4b", image: "/assets/home/forest-pest.jpg" },
    ],
  },

  onShow() {
    authService.requireLogin();
  },

  openModule(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "forest") return wx.navigateTo({ url: "/pages/forest/index" });
    if (key === "ancient") return wx.navigateTo({ url: "/pages/ancient/index" });
    if (key === "pest") return wx.navigateTo({ url: "/pages/pest/index" });
  },
});
