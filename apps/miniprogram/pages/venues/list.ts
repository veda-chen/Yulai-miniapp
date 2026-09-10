import { callCloud } from "../../services/cloud-api";

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
