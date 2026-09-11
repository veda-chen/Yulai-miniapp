import { callCloud } from "../../services/cloud-api";
import { formatChinaDateTime } from "../../utils/date";

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
  data: {
    loading: true,
    detail: null as DisplayVenueDetail | null,
    message: "",
  },

  async onLoad(options: Record<string, string | undefined>) {
    try {
      const detail = await callCloud<VenueDetail>("venue.get", { id: options.id });
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
