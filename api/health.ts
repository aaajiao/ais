/**
 * 健康检查端点
 * GET /api/health
 *
 * 供前端网络状态检测使用，不调用任何外部服务。
 */

export const config = {
  runtime: 'edge',
};

export default function handler() {
  return new Response(null, { status: 204 });
}
