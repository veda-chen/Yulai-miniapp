import { callCloud } from "../../services/cloud-api";

type ValueEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type VenueItem = { id: string; name: string; status: string };
type Venue = VenueItem & {
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
  verificationStatus: string;
};

const STATUSES = [
  { value: "PENDING_VERIFICATION", label: "待核验" },
  { value: "ACTIVE", label: "已核验并发布" },
];

function chinaDate(value: string | null): string {
  if (!value) return "";
  const source = new Date(value);
  const date = new Date(source.getTime() + 8 * 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

Page({
  data: {
    loading: true,
    saving: false,
    uploadingField: "",
    venues: [] as VenueItem[],
    venueIndex: 0,
    statuses: STATUSES,
    statusIndex: 0,
    form: {
      id: "",
      name: "",
      address: "",
      description: "",
      entranceGuide: "",
      openingHours: "",
      accessPolicy: "",
      bookingInstructions: "",
      contactPhone: "",
      facilitiesText: "",
      coverFileId: "",
      floorPlanFileId: "",
      verifiedAt: "",
      verificationSource: "",
    },
    message: "未核验内容可以留空并保存为待核验",
  },

  async onLoad() {
    try {
      const result = await callCloud<{ venues: VenueItem[] }>("admin.venue.list");
      if (result.venues.length === 0) throw new Error("暂无可维护场馆");
      this.setData({ venues: result.venues });
      await this.loadVenue(0);
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "场馆资料加载失败",
      });
    }
  },

  async loadVenue(index: number) {
    const selected = this.data.venues[index];
    if (!selected) return;
    this.setData({ loading: true, venueIndex: index, message: "正在加载场馆资料" });
    const detail = await callCloud<{ venue: Venue }>("venue.get", { id: selected.id });
    const venue = detail.venue;
    this.setData({
      loading: false,
      statusIndex: Math.max(
        0,
        STATUSES.findIndex((status) => status.value === venue.verificationStatus),
      ),
      form: {
        id: venue.id,
        name: venue.name,
        address: venue.address ?? "",
        description: venue.description ?? "",
        entranceGuide: venue.entranceGuide ?? "",
        openingHours: venue.openingHours ?? "",
        accessPolicy: venue.accessPolicy ?? "",
        bookingInstructions: venue.bookingInstructions ?? "",
        contactPhone: venue.contactPhone ?? "",
        facilitiesText: venue.facilities.join("、"),
        coverFileId: venue.coverFileId ?? "",
        floorPlanFileId: venue.floorPlanFileId ?? "",
        verifiedAt: chinaDate(venue.verifiedAt),
        verificationSource: venue.verificationSource ?? "",
      },
      message: "未核验内容可以留空并保存为待核验",
    });
  },

  async onVenueChange(event: ValueEvent) {
    await this.loadVenue(Number(event.detail.value));
  },

  onStatusChange(event: ValueEvent) {
    this.setData({ statusIndex: Number(event.detail.value) });
  },

  onFieldInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const field = String(event.currentTarget.dataset.field);
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onVerifiedDateChange(event: ValueEvent) {
    this.setData({ "form.verifiedAt": event.detail.value });
  },

  async uploadImage(event: WechatMiniprogram.TouchEvent) {
    const field = String(event.currentTarget.dataset.field) as "coverFileId" | "floorPlanFileId";
    if (this.data.uploadingField || !this.data.form.id) return;
    const selection = await wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
    });
    const file = selection.tempFiles[0];
    if (!file) return;
    const extension = /\.(png|jpe?g)$/i.exec(file.tempFilePath)?.[0].toLowerCase() ?? ".jpg";
    const cloudPath = `venues/${this.data.form.id}/${field}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
    let uploadedFileId = "";
    this.setData({ uploadingField: field, message: "正在上传图片" });
    try {
      const upload = await wx.cloud.uploadFile({ cloudPath, filePath: file.tempFilePath });
      uploadedFileId = upload.fileID;
      await callCloud("admin.venue.update", { id: this.data.form.id, [field]: upload.fileID });
      this.setData({ [`form.${field}`]: upload.fileID, message: "图片已更新" });
    } catch (error) {
      if (uploadedFileId) {
        try {
          await wx.cloud.deleteFile({ fileList: [uploadedFileId] });
        } catch {}
      }
      this.setData({ message: error instanceof Error ? error.message : "图片上传失败" });
    } finally {
      this.setData({ uploadingField: "" });
    }
  },

  async removeImage(event: WechatMiniprogram.TouchEvent) {
    const field = String(event.currentTarget.dataset.field) as "coverFileId" | "floorPlanFileId";
    if (this.data.uploadingField || !this.data.form[field]) return;
    this.setData({ uploadingField: field });
    try {
      await callCloud("admin.venue.update", { id: this.data.form.id, [field]: null });
      this.setData({ [`form.${field}`]: "", message: "图片已移除" });
    } catch (error) {
      this.setData({ message: error instanceof Error ? error.message : "图片移除失败" });
    } finally {
      this.setData({ uploadingField: "" });
    }
  },

  async save() {
    if (this.data.saving) return;
    const form = this.data.form;
    const status = STATUSES[this.data.statusIndex]?.value ?? "PENDING_VERIFICATION";
    this.setData({ saving: true, message: "正在保存场馆资料" });
    try {
      await callCloud("admin.venue.update", {
        id: form.id,
        name: form.name,
        address: form.address,
        description: form.description,
        entranceGuide: form.entranceGuide,
        openingHours: form.openingHours,
        accessPolicy: form.accessPolicy,
        bookingInstructions: form.bookingInstructions,
        contactPhone: form.contactPhone,
        facilities: form.facilitiesText
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
        verifiedAt: form.verifiedAt ? `${form.verifiedAt}T00:00:00+08:00` : null,
        verificationSource: form.verificationSource,
        status,
      });
      this.setData({ message: "场馆资料已保存" });
      wx.showToast({ title: "保存成功", icon: "success" });
    } catch (error) {
      this.setData({ message: error instanceof Error ? error.message : "保存失败" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
