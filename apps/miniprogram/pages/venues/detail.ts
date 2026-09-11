import { callCloud } from "../../services/cloud-api";

type VenueDetail = {
  venue: {
    id: string;
    name: string;
    address: string | null;
    description: string | null;
    verificationStatus: "ACTIVE" | "PENDING_VERIFICATION";
  };
  courts: Array<{ id: string; name: string; locationHint: string | null }>;
};

Page({
  data: {
    loading: true,
    detail: null as VenueDetail | null,
    message: "",
  },

  async onLoad(options: Record<string, string | undefined>) {
    try {
      const detail = await callCloud<VenueDetail>("venue.get", { id: options.id });
      this.setData({ loading: false, detail });
      wx.setNavigationBarTitle({ title: detail.venue.name });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "场馆加载失败",
      });
    }
  },
});
