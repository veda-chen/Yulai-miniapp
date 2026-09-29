import { appearanceView, applyNativeAppearance, loadAppearanceState } from "../../utils/appearance";

Page({
  data: {
    ...appearanceView(),
    sections: [
      {
        index: "01",
        title: "计分与换边",
        description: "现行21分制",
        items: [
          "每球得分，通常采用三局两胜；先到21分且领先2分的一方赢得本局。",
          "20平后需领先2分；29平后先得第30分的一方获胜。",
          "每局结束后换边；决胜局一方先到11分时再次换边。",
        ],
      },
      {
        index: "02",
        title: "正确发球",
        description: "发球动作与站位",
        items: [
          "发球方与接发方站在斜对角发球区内，脚不得踩线。",
          "从发球开始到击中球，双方双脚的一部分应保持接触地面并基本静止。",
          "击球瞬间整个球应低于场地表面1.15米，拍头向前连续运动，并先击中球托。",
          "发球方分数为偶数时从右发球区发球，奇数时从左发球区发球。",
        ],
      },
      {
        index: "03",
        title: "单打与双打",
        description: "边线和发球顺序",
        items: [
          "单打使用内侧边线和后发球线；双打使用外侧边线，发球时以后内侧长发球线为界。",
          "发球方赢得一分后继续发球，并换到另一侧发球区；接发方赢得一分后取得下一次发球权。",
          "双打发球顺序按得分和发球权轮转，同一方球员不得在一局中连续两次接发同一发球。",
        ],
      },
      {
        index: "04",
        title: "常见违例",
        description: "出现时对方得分",
        items: [
          "球落在界外、未过网、触及天花板或墙壁，均为违例。",
          "球员、球拍或衣物触网，或妨碍、分散对手注意力，属于违例。",
          "同一球员连续击球两次，或球在球拍上被明显停留后抛出，属于违例。",
          "发球不符合站位、高度、连续动作等要求时，判发球违例。",
        ],
      },
      {
        index: "05",
        title: "重发球与休息",
        description: "本回合不计分",
        items: [
          "接发方尚未准备好且没有尝试接球、双方同时发球违例，或出现意外干扰时，可以重发球。",
          "重发球后由上一回合的发球方再次发球，上一回合不计分。",
          "每局领先方到11分时可休息不超过60秒；局间休息不超过120秒。",
        ],
      },
    ],
  },
  onShow() {
    const state = loadAppearanceState();
    applyNativeAppearance(state.preferences);
    this.setData(appearanceView(state.preferences));
  },
});
