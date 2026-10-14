import { callCloud } from "../../services/cloud-api";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

type Venue = {
  id: string;
  name: string;
  address: string | null;
  verificationStatus: "ACTIVE" | "PENDING_VERIFICATION";
};

Page({
  data: {
    loading: true,
    venues: [] as Venue[],
    message: "",
    ...appearanceView(),
  },

  onShow() {
    const state = loadAppearanceState();
    applyNativeAppearance(state.preferences);
    (this.getTabBar?.() as { refresh?: () => void } | null)?.refresh?.();
    this.setData(appearanceView(state.preferences));
  },

  async onLoad() {
    await this.loadVenues();
  },

  async retry() {
    await this.loadVenues();
  },

  async loadVenues() {
    this.setData({ loading: true, message: "" });
    try {
      const result = await callCloud<{ venues: Venue[] }>("venue.list");
      this.setData({ loading: false, venues: result.venues, message: "" });
    } catch {
      this.setData({ loading: false, message: "场馆加载失败，请稍后重试" });
    }
  },
});
