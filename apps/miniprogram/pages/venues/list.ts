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
    this.setData(appearanceView(state.preferences));
  },

  async onLoad() {
    try {
      const result = await callCloud<{ venues: Venue[] }>("venue.list");
      this.setData({ loading: false, venues: result.venues });
    } catch {
      this.setData({ loading: false, message: "场馆加载失败，请稍后重试" });
    }
  },
});
