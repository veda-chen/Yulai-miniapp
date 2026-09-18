import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

Page({
  data: { ...appearanceView() },
  onShow() {
    const state = loadAppearanceState();
    applyNativeAppearance(state.preferences);
    this.setData(appearanceView(state.preferences));
  },
  copyContact() {
    wx.setClipboardData({
      data: "2724309224@qq.com",
    });
  },
});
