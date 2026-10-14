import { callCloud } from "../../services/cloud-api";
import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

type Choice = "YES" | "MAYBE" | "NO";
type InvitationView = {
  invitation: { id: string; ownerName: string; preset: string; title: string; line: string };
  counts: Record<Choice, number>;
  mine: Choice | null;
  isOwner: boolean;
  people: Array<{ nickname: string; choice: Choice; label?: string }>;
};

const PRESETS = [
  {
    id: "cute",
    name: "撒娇鸭",
    symbol: "🐥",
    title: "这周有没有球打鸭？",
    line: "再不打球，我的球拍都要长蘑菇了。",
  },
  {
    id: "wild",
    name: "发疯鸭",
    symbol: "🦆",
    title: "快快打球啦！",
    line: "我要长在椅子上了，快来把我捞走！",
  },
  {
    id: "challenge",
    name: "战书鸭",
    symbol: "🏸",
    title: "球场见！",
    line: "输赢随意，嘴硬到底。敢不敢来？",
  },
];

const REACTIONS: Record<Choice, string> = {
  YES: "已捕获一只野生球搭子！🎉",
  MAYBE: "记下了，等你档期鸭。📝",
  NO: "好叭，我和球拍再坚强一会儿。🥲",
};
const RESULT_ICONS: Record<Choice, string> = { YES: "🐣", MAYBE: "📝", NO: "🥲" };
const DUCK_SECRETS = [
  "看我干嘛，约我打球啊！🏸",
  "球拍已经热身，就差你了鸭！🔥",
  "再戳一下，我就当你想打球咯。👀",
  "偷偷说：今天很适合和球搭子见面。✨",
] as const;

Page({
  invitationId: "",
  data: {
    ...appearanceView(),
    presets: PRESETS,
    presetIndex: 0,
    title: PRESETS[0]?.title ?? "这周有没有球打鸭？",
    invitation: null as InvitationView["invitation"] | null,
    viewingId: false,
    counts: { YES: 0, MAYBE: 0, NO: 0 },
    mine: null as Choice | null,
    isOwner: false,
    people: [] as InvitationView["people"],
    busy: false,
    message: "",
    duckTapIndex: 0,
    resultOpen: false,
    resultIcon: "🐣",
    resultKicker: "小鸭收到你的回答啦",
    resultText: "",
    resultNote: "这只是打球意向，正式球局还需单独报名。",
    duck: "🐥",
    lastId: "",
  },
  onLoad(options: Record<string, string | undefined>) {
    wx.hideShareMenu();
    this.invitationId = options.id || "";
    this.setData({ viewingId: Boolean(this.invitationId) });
    const lastId = wx.getStorageSync("lastPlayInvitationId");
    if (typeof lastId === "string") this.setData({ lastId });
  },
  onShow() {
    const state = loadAppearanceState();
    applyNativeAppearance(state.preferences);
    this.setData(appearanceView(state.preferences));
    if (this.invitationId) void this.loadInvitation();
  },
  async loadInvitation() {
    this.setData({ busy: true, message: "" });
    try {
      const result = await callCloud<InvitationView>("invitation.get", { id: this.invitationId });
      this.setData({
        invitation: result.invitation,
        counts: result.counts,
        mine: result.mine,
        isOwner: result.isOwner,
        people: result.people.map((person) => ({
          ...person,
          label: person.choice === "YES" ? "想打" : "有空就来",
        })),
        duck: result.mine === "NO" ? "🥲" : result.mine === "YES" ? "🐣" : "🐥",
      });
      wx.showShareMenu({ menus: ["shareAppMessage"] });
    } catch (error) {
      this.setData({ message: error instanceof Error ? error.message : "邀请加载失败" });
    } finally {
      this.setData({ busy: false });
    }
  },
  choosePreset(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const preset = PRESETS[index];
    if (preset) this.setData({ presetIndex: index, title: preset.title });
  },
  onTitleInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ title: event.detail.value });
  },
  async createInvitation() {
    if (this.data.busy) return;
    const title = this.data.title.trim();
    if (title.length < 2 || title.length > 32) {
      wx.showToast({ title: "标题需为2至32个字", icon: "none" });
      return;
    }
    this.setData({ busy: true, message: "" });
    try {
      const created = await callCloud<{ id: string }>("invitation.create", {
        preset: PRESETS[this.data.presetIndex]?.id ?? "cute",
        title,
      });
      this.invitationId = created.id;
      this.setData({ viewingId: true });
      wx.setStorageSync("lastPlayInvitationId", created.id);
      this.setData({ lastId: created.id });
      await this.loadInvitation();
      wx.showToast({ title: "邀请卡做好啦", icon: "success" });
    } catch (error) {
      this.setData({ message: error instanceof Error ? error.message : "创建失败，请重试" });
    } finally {
      this.setData({ busy: false });
    }
  },
  async respond(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
    const choice = event.currentTarget.dataset.choice as Choice;
    if (!(choice in REACTIONS)) return;
    this.setData({ busy: true, message: "" });
    try {
      await callCloud("invitation.reply", { id: this.invitationId, choice });
      this.setData({ duck: choice === "NO" ? "🥲" : choice === "YES" ? "🐣" : "🐥" });
      await this.loadInvitation();
      this.setData({
        resultOpen: true,
        resultIcon: RESULT_ICONS[choice],
        resultKicker: "小鸭收到你的回答啦",
        resultText: REACTIONS[choice],
        resultNote: "这只是打球意向，正式球局还需单独报名。",
      });
    } catch (error) {
      this.setData({ message: error instanceof Error ? error.message : "回应失败，请重试" });
    } finally {
      this.setData({ busy: false });
    }
  },
  pokeDuck() {
    const secret =
      DUCK_SECRETS[this.data.duckTapIndex % DUCK_SECRETS.length] ?? "看我干嘛，约我打球啊！🏸";
    this.setData({
      duckTapIndex: this.data.duckTapIndex + 1,
      duck: "🦆",
      resultOpen: true,
      resultIcon: "🦆",
      resultKicker: "小鸭的悄悄话",
      resultText: secret,
      resultNote: "再戳一次，小鸭还有话说。",
    });
  },
  closeResult() {
    this.setData({ resultOpen: false });
  },
  stopResultTap() {},
  newInvitation() {
    this.invitationId = "";
    wx.hideShareMenu();
    this.setData({
      invitation: null,
      viewingId: false,
      lastId: "",
      message: "",
      duckTapIndex: 0,
      resultOpen: false,
      mine: null,
    });
  },
  onShareAppMessage() {
    return {
      title: `${this.data.invitation?.title || "这周有没有球打鸭？"} 🏸`,
      path: `/pages/tools/invitation?id=${this.invitationId}`,
      imageUrl: "/assets/duck-share-cover.jpg",
    };
  },
});
