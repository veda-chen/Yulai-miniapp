import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

type VenueDetail = {
  venue: {
    id: string;
    name: string;
    address: string | null;
    description: string | null;
    entranceGuide: string | null;
    openingHours: string | null;
    accessPolicy: string | null;
    bookingInstructions: string | null;
    contactPhone: string | null;
    facilities: string[];
    coverFileId: string | null;
    floorPlanFileId: string | null;
    verifiedAt: string | null;
    verificationSource: string | null;
    verificationStatus: "ACTIVE" | "PENDING_VERIFICATION";
  };
  courts: Array<{
    id: string;
    name: string;
    locationHint: string | null;
    floorName: string | null;
    surface: string | null;
    lighting: string | null;
  }>;
};

type DisplayVenueDetail = VenueDetail & {
  hasVisitInfo: boolean;
  verificationText: string;
  courts: Array<VenueDetail["courts"][number] & { metaText: string }>;
};

Page({
  venueId: "",
  requestVersion: 0,
  isVisible: true,
  data: {
    loading: true,
    detail: null as DisplayVenueDetail | null,
    message: "",
    ...appearanceView(),
  },

  onLoad(options: Record<string, string | undefined>) {
    const appearance = loadAppearanceState();
    applyNativeAppearance(appearance.preferences);
    this.setData(appearanceView(appearance.preferences));
    this.venueId = options.id ?? "";
  },

  onShow() {
    this.isVisible = true;
    if (this.venueId && !this.data.detail) void this.loadVenue();
  },

  onHide() {
    this.isVisible = false;
    this.requestVersion += 1;
  },

  onUnload() {
    this.isVisible = false;
    this.requestVersion += 1;
  },

  async retry() {
    await this.loadVenue();
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  async loadVenue() {
    const requestVersion = ++this.requestVersion;
    if (!this.venueId) {
      this.setData({ loading: false, message: "场馆链接无效" });
      return;
    }
    this.setData({ loading: true, message: "" });
    try {
      const detail = await callCloud<VenueDetail>("venue.get", { id: this.venueId });
      if (!this.isVisible || requestVersion !== this.requestVersion) return;
      const hasVisitInfo = Boolean(
        detail.venue.entranceGuide ||
          detail.venue.openingHours ||
          detail.venue.accessPolicy ||
          detail.venue.bookingInstructions ||
          detail.venue.contactPhone,
      );
      this.setData({
        loading: false,
        detail: {
          ...detail,
          hasVisitInfo,
          verificationText: detail.venue.verifiedAt
            ? (formatChinaDateTime(detail.venue.verifiedAt).split(" ")[0] ?? "已核验")
            : "尚未完成现场核验",
          courts: detail.courts.map((court) => ({
            ...court,
            metaText: [court.floorName, court.surface, court.lighting].filter(Boolean).join(" · "),
          })),
        },
      });
      wx.setNavigationBarTitle({ title: detail.venue.name });
    } catch (error) {
      if (!this.isVisible || requestVersion !== this.requestVersion) return;
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "场馆加载失败",
      });
    }
  },

  copyVenuePhone() {
    const phone = this.data.detail?.venue.contactPhone;
    if (phone) wx.setClipboardData({ data: phone });
  },
});
