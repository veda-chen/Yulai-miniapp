Component({
  properties: {
    heroStyle: { type: String, value: "photo" },
    title: { type: String, value: "今天有约球计划吗？" },
    description: { type: String, value: "大学城各高校球友在线组队，轻松找到志同道合的搭档。" },
    actionText: { type: String, value: "创建球局" },
    imageSrc: { type: String, value: "/assets/hero-badminton-bg.jpg" },
    url: { type: String, value: "/pages/activities/form" },
    readonly: { type: Boolean, value: false },
  },
  methods: {
    activate() {
      if (this.data.readonly || !this.data.url) return;
      wx.navigateTo({ url: this.data.url });
    },
  },
});
