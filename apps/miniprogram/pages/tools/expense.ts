import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";
import {
  formatCents,
  settleExpenses,
  uniqueNames,
  type ExpenseInput,
} from "../../utils/tool-domain";
import { clearToolDraft, loadToolDraft, saveToolDraft } from "../../utils/tool-storage";

type ExpenseRow = ExpenseInput & { id: string; payerIndex: number };
type ExpenseDraft = { namesInput: string; expenses: ExpenseInput[] };
const isExpenseDraft = (value: unknown): value is ExpenseDraft => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ExpenseDraft>;
  return (
    typeof item.namesInput === "string" &&
    item.namesInput.length <= 1000 &&
    Array.isArray(item.expenses) &&
    item.expenses.length >= 1 &&
    item.expenses.length <= 30 &&
    item.expenses.every(
      (expense) =>
        expense &&
        typeof expense.label === "string" &&
        expense.label.length <= 50 &&
        typeof expense.amountText === "string" &&
        expense.amountText.length <= 20 &&
        typeof expense.payer === "string" &&
        expense.payer.length <= 40,
    )
  );
};
const newExpense = (index: number, payer = ""): ExpenseRow => ({
  id: `${Date.now()}-${index}`,
  label: index === 0 ? "场地费" : "",
  amountText: "",
  payer,
  payerIndex: 0,
});

Page({
  data: {
    ...appearanceView(),
    namesInput: "",
    names: [] as string[],
    expenses: [newExpense(0)] as ExpenseRow[],
    calculated: false,
    totalText: "0.00",
    memberResults: [] as Array<{
      name: string;
      owedText: string;
      paidText: string;
      balanceText: string;
      positive: boolean;
      negative: boolean;
    }>,
    transfers: [] as Array<{ key: string; from: string; to: string; amountText: string }>,
  },
  onLoad() {
    const draft = loadToolDraft("expense", isExpenseDraft);
    if (draft)
      this.setData({
        namesInput: draft.namesInput,
        expenses: draft.expenses.map((item, index) => ({
          ...item,
          id: `${Date.now()}-${index}`,
          payerIndex: 0,
        })),
      });
    this.refreshNames();
  },
  onShow() {
    const state = loadAppearanceState();
    applyNativeAppearance(state.preferences);
    this.setData(appearanceView(state.preferences));
  },
  saveDraft() {
    saveToolDraft("expense", {
      namesInput: this.data.namesInput,
      expenses: this.data.expenses.map(({ label, amountText, payer }) => ({
        label,
        amountText,
        payer,
      })),
    });
  },
  refreshNames() {
    const names = uniqueNames(this.data.namesInput, 20);
    const expenses = this.data.expenses.map((item) => {
      const payer = names.includes(item.payer) ? item.payer : "";
      return { ...item, payer, payerIndex: Math.max(0, names.indexOf(payer)) };
    });
    this.setData({ names, expenses, calculated: false });
  },
  onNamesInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ namesInput: event.detail.value });
    this.refreshNames();
    this.saveDraft();
  },
  onExpenseInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field as "label" | "amountText";
    this.setData({ [`expenses[${index}].${field}`]: event.detail.value, calculated: false });
    this.saveDraft();
  },
  onPayerChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.currentTarget.dataset.index);
    const payerIndex = Number(event.detail.value);
    this.setData({
      [`expenses[${index}].payerIndex`]: payerIndex,
      [`expenses[${index}].payer`]: this.data.names[payerIndex] ?? "",
      calculated: false,
    });
    this.saveDraft();
  },
  addExpense() {
    if (this.data.expenses.length >= 30) {
      wx.showToast({ title: "最多添加30笔费用", icon: "none" });
      return;
    }
    this.setData({
      expenses: [
        ...this.data.expenses,
        newExpense(this.data.expenses.length, this.data.names[0] ?? ""),
      ],
      calculated: false,
    });
    this.saveDraft();
  },
  removeExpense(event: WechatMiniprogram.TouchEvent) {
    if (this.data.expenses.length === 1) {
      wx.showToast({ title: "至少保留1笔费用", icon: "none" });
      return;
    }
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      expenses: this.data.expenses.filter((_, itemIndex) => itemIndex !== index),
      calculated: false,
    });
    this.saveDraft();
  },
  calculate() {
    try {
      const result = settleExpenses(this.data.names, this.data.expenses);
      this.setData({
        calculated: true,
        totalText: formatCents(result.totalCents),
        memberResults: result.members.map((item) => ({
          name: item.name,
          owedText: formatCents(item.owedCents),
          paidText: formatCents(item.paidCents),
          balanceText:
            item.balanceCents > 0
              ? `应收¥${formatCents(item.balanceCents)}`
              : item.balanceCents < 0
                ? `应补¥${formatCents(-item.balanceCents)}`
                : "已结清",
          positive: item.balanceCents > 0,
          negative: item.balanceCents < 0,
        })),
        transfers: result.transfers.map((item, index) => ({
          key: `${index}-${item.from}-${item.to}`,
          from: item.from,
          to: item.to,
          amountText: formatCents(item.amountCents),
        })),
      });
      this.saveDraft();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "无法计算", icon: "none" });
    }
  },
  async clearTool() {
    const result = await wx.showModal({
      title: "清空费用数据",
      content: "参与者和费用明细将从本机删除。",
    });
    if (!result.confirm) return;
    if (!clearToolDraft("expense")) return;
    this.setData({
      namesInput: "",
      names: [],
      expenses: [newExpense(0)],
      calculated: false,
      totalText: "0.00",
      memberResults: [],
      transfers: [],
    });
  },
});
