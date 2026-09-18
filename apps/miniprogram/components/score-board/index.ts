Component({
  properties: {
    nameA: { type: String, value: "A方" },
    nameB: { type: String, value: "B方" },
    scoreA: { type: Number, value: 0 },
    scoreB: { type: Number, value: 0 },
    finished: { type: Boolean, value: false },
    editableNames: { type: Boolean, value: false },
    scoreTheme: { type: String, value: "default" },
    readonly: { type: Boolean, value: false },
  },
  methods: {
    nameInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      this.triggerEvent("namechange", {
        side: event.currentTarget.dataset.side,
        value: event.detail.value,
      });
    },
    change(event: WechatMiniprogram.TouchEvent) {
      if (this.data.readonly) return;
      this.triggerEvent("scorechange", {
        side: event.currentTarget.dataset.side,
        delta: Number(event.currentTarget.dataset.delta),
      });
    },
  },
});
