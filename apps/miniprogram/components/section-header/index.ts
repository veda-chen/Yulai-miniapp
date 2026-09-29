Component({
  properties: {
    title: { type: String, value: "" },
    description: { type: String, value: "" },
    actionText: { type: String, value: "" },
    url: { type: String, value: "" },
    index: { type: String, value: "01" },
    readonly: { type: Boolean, value: false },
  },
  methods: {
    activate() {
      if (!this.data.readonly && !this.data.url) this.triggerEvent("action");
    },
  },
});
