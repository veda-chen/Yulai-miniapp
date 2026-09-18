Component({
  properties: {
    title: { type: String, value: "暂无内容" },
    description: { type: String, value: "" },
    url: { type: String, value: "" },
    actionText: { type: String, value: "" },
  },
  methods: {
    activate() {
      this.triggerEvent("action");
    },
  },
});
