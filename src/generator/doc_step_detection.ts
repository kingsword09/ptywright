export function isLikelyStep(text: string): boolean {
  const stepPatterns = [
    /^(run|execute|type|enter|press|click|open|start|stop|wait|check|verify|assert)/i,
    /^(输入|执行|运行|点击|打开|启动|停止|等待|检查|验证)/,
    /\$\s+\w+/,
    /^>\s+\w+/,
  ];

  return stepPatterns.some((pattern) => pattern.test(text));
}
