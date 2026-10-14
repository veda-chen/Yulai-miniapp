import { appearanceView, loadAppearanceState } from "../utils/appearance";

const tabs = [
  {
    pagePath: "pages/index/index",
    text: "首页",
    icon: "/assets/icons/tab/home-v2.png",
    selectedIcon: "/assets/icons/tab/home-v2-active.png",
  },
  {
    pagePath: "pages/tools/index",
    text: "工具",
    icon: "/assets/icons/tab/tools-v2.png",
    selectedIcon: "/assets/icons/tab/tools-v2-active.png",
  },
  {
    pagePath: "pages/venues/list",
    text: "场馆",
    icon: "/assets/icons/tab/pin-v2.png",
    selectedIcon: "/assets/icons/tab/pin-v2-active.png",
  },
  {
    pagePath: "pages/profile/index",
    text: "我的",
    icon: "/assets/icons/tab/user-v2.png",
    selectedIcon: "/assets/icons/tab/user-v2-active.png",
  },
];

Component({
  data: {
    tabs,
    selected: 0,
    isDark: false,
    primaryColor: "#007aff",
    activeBackground: "#e5f1ff",
  },
  lifetimes: {
    attached() {
      this.refresh();
    },
  },
  pageLifetimes: {
    show() {
      this.refresh();
    },
  },
  methods: {
    refresh() {
      const pages = getCurrentPages();
      const route = pages[pages.length - 1]?.route;
      const selected = tabs.findIndex((tab) => tab.pagePath === route);
      const preferences = loadAppearanceState().preferences;
      const { isDark, primaryColor } = appearanceView(preferences);
      this.setData({
        selected: selected < 0 ? 0 : selected,
        isDark,
        primaryColor,
        activeBackground: isDark
          ? "rgba(255,255,255,.12)"
          : preferences.brand === "green"
            ? "#e4f4ef"
            : preferences.brand === "orange"
              ? "#fff0e7"
              : "#e5f1ff",
      });
    },
    switchTab(event: WechatMiniprogram.TouchEvent) {
      const pagePath = String(event.currentTarget.dataset.path || "");
      if (!tabs.some((tab) => tab.pagePath === pagePath)) return;
      const pages = getCurrentPages();
      if (pages[pages.length - 1]?.route === pagePath) return;
      wx.switchTab({ url: `/${pagePath}` });
    },
  },
});
