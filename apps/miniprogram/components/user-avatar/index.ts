Component({
  properties: {
    src: { type: String, value: "" },
    name: { type: String, value: "羽来球友" },
    size: { type: Number, value: 88 },
  },
  data: { imageFailed: false, initial: "羽" },
  observers: {
    src() {
      this.setData({ imageFailed: false });
    },
    name(value: string) {
      this.setData({ initial: value.trim().slice(0, 1) || "羽" });
    },
  },
  methods: {
    onImageError() {
      this.setData({ imageFailed: true });
    },
  },
});
