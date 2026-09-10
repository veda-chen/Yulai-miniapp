if (!wx.cloud) {
  throw new Error("当前微信基础库不支持云开发");
}

wx.cloud.init({
  env: "cloud1-d1g8z3590d3768cbb",
  traceUser: true,
});

App({
  globalData: {
    cloudFunctionName: "api",
  },
});
