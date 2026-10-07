type ParticipantRow = {
  id: number;
  value: string;
  error: string;
  focus: boolean;
};

type ChangeDetail = {
  value: string;
  names: string[];
  hasDuplicates: boolean;
};

let nextRowId = 1;

function duplicateErrors(rows: ParticipantRow[]): string[] {
  return duplicateParticipantErrors(rows.map((row) => row.value));
}

function decorateRows(rows: ParticipantRow[]): ParticipantRow[] {
  const errors = duplicateErrors(rows);
  return rows.map((row, index) => ({ ...row, error: errors[index] ?? "" }));
}

Component({
  properties: {
    value: {
      type: String,
      value: "",
      observer(value: string) {
        this.syncValue(value);
      },
    },
    minSlots: { type: Number, value: 4 },
    maxParticipants: { type: Number, value: 40 },
    batchEnabled: { type: Boolean, value: true },
    disabled: { type: Boolean, value: false },
    addLabel: { type: String, value: "添加球友" },
  },
  data: {
    rows: [] as ParticipantRow[],
    batchVisible: false,
    batchText: "",
    batchHasText: false,
  },
  lifetimes: {
    attached() {
      this.syncValue(this.properties.value);
    },
  },
  methods: {
    rowsValue(rows?: ParticipantRow[]) {
      return (rows ?? this.data.rows).map((row: ParticipantRow) => row.value).join("\n");
    },

    syncValue(value: string) {
      if (this.data.rows.length > 0 && this.rowsValue() === value) return;
      const values = participantValues(
        value,
        this.properties.minSlots,
        this.properties.maxParticipants,
      );
      const rows = values.map((rowValue) => ({
        id: nextRowId++,
        value: rowValue,
        error: "",
        focus: false,
      }));
      this.setData({ rows: decorateRows(rows) });
    },

    emitChange(rows: ParticipantRow[], after?: () => void) {
      const decorated = decorateRows(rows);
      const names = decorated.map((row) => row.value.trim()).filter(Boolean);
      const hasDuplicates = decorated.some((row) => Boolean(row.error));
      const detail: ChangeDetail = {
        value: decorated.map((row) => row.value).join("\n"),
        names: [...new Set(names)],
        hasDuplicates,
      };
      this.setData({ rows: decorated }, after);
      this.triggerEvent("change", detail);
    },

    scrollToRow(id: number) {
      const query = this.createSelectorQuery();
      query.select(`#participant-row-${id}`).boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec((results) => {
        const rect = results[0] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
        const viewport = results[1] as WechatMiniprogram.ScrollOffsetCallbackResult | null;
        if (!rect || !viewport) return;
        wx.pageScrollTo({
          scrollTop: Math.max(0, viewport.scrollTop + rect.top - 120),
          duration: 180,
        });
      });
    },

    onInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      if (this.properties.disabled) return;
      const index = Number(event.currentTarget.dataset.index);
      const rows = this.data.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, value: event.detail.value } : row,
      );
      this.emitChange(rows);
    },

    onFocus(event: WechatMiniprogram.BaseEvent) {
      const index = Number(event.currentTarget.dataset.index);
      this.setData({
        rows: this.data.rows.map((row, rowIndex) => ({ ...row, focus: rowIndex === index })),
      });
    },

    onConfirm(event: WechatMiniprogram.BaseEvent) {
      const index = Number(event.currentTarget.dataset.index);
      if (index >= this.data.rows.length - 1) return;
      this.setData({
        rows: this.data.rows.map((row, rowIndex) => ({ ...row, focus: rowIndex === index + 1 })),
      });
    },

    addRow() {
      if (this.properties.disabled) return;
      if (this.data.rows.length >= this.properties.maxParticipants) {
        wx.showToast({ title: `最多${this.properties.maxParticipants}人`, icon: "none" });
        return;
      }
      const rows = this.data.rows.map((row) => ({ ...row, focus: false }));
      const id = nextRowId++;
      rows.push({ id, value: "", error: "", focus: true });
      this.emitChange(rows, () => this.scrollToRow(id));
    },

    removeRow(event: WechatMiniprogram.BaseEvent) {
      if (this.properties.disabled) return;
      const index = Number(event.currentTarget.dataset.index);
      const values = removeParticipantValue(
        this.data.rows.map((row) => row.value),
        index,
        this.properties.minSlots,
      );
      const rows = values.map((value, rowIndex) => ({
        id: nextRowId++,
        value,
        error: "",
        focus: rowIndex === Math.min(index, values.length - 1),
      }));
      this.emitChange(rows);
    },

    openBatch() {
      if (!this.properties.disabled) this.setData({ batchVisible: true, batchText: "" });
    },

    closeBatch() {
      this.setData({ batchVisible: false, batchText: "", batchHasText: false });
    },

    stopTap() {},

    preventTouchMove() {},

    onBatchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      this.setData({
        batchText: event.detail.value,
        batchHasText: Boolean(event.detail.value.trim()),
      });
    },

    importBatch() {
      const rows = this.data.rows.map((row) => ({ ...row, focus: false }));
      const merged = mergeParticipantValues(
        rows.map((row) => row.value),
        this.data.batchText,
        this.properties.maxParticipants,
      );
      const mergedRows = merged.values.map((value, index) =>
        rows[index]
          ? { ...(rows[index] as ParticipantRow), value }
          : { id: nextRowId++, value, error: "", focus: false },
      );
      this.setData({ batchVisible: false, batchText: "", batchHasText: false });
      this.emitChange(mergedRows);
      wx.showToast({
        title: merged.skipped
          ? `导入${merged.imported}人，跳过${merged.skipped}人`
          : `已导入${merged.imported}人`,
        icon: "none",
      });
    },
  },
});
import {
  duplicateParticipantErrors,
  mergeParticipantValues,
  participantValues,
  removeParticipantValue,
} from "../../utils/participant-editor";
