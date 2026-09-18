Component({
  properties: {
    label: { type: String, value: "按钮" },
    variant: { type: String, value: "primary" },
    loading: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
  },
  methods: {
    activate() {
      if (!this.data.loading && !this.data.disabled) this.triggerEvent("action");
    },
  },
});
