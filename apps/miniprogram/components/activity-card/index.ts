Component({
  properties: {
    url: { type: String, value: "" },
    title: { type: String, value: "羽毛球局" },
    time: { type: String, value: "" },
    date: { type: String, value: "" },
    venue: { type: String, value: "" },
    level: { type: String, value: "不限水平" },
    countText: { type: String, value: "" },
    status: { type: String, value: "报名中" },
    waiting: { type: Boolean, value: false },
    density: { type: String, value: "comfortable" },
    readonly: { type: Boolean, value: false },
  },
  methods: {
    activate() {
      if (this.data.readonly || !this.data.url) return;
      wx.navigateTo({ url: this.data.url });
    },
  },
});
