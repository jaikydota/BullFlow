/**
 * 国内/海外分发平台发布失败的可操作建议 + 抖音风控识别。
 *
 * 注：账号「主页/平台」链接由推量发网关提供——网关授权时把 `platform_home_url` 拼成
 * 用户主页或平台站点首页，并给 `home_url_is_profile` 标明是哪种，前端直接用（AccountsPage /
 * TaskDetailPage / TaskMonitorPage），此处不维护主页链接兜底。
 * 作品详情链接用 result_summary 里的 openUrl（审核通过后由 webhook 带回）。
 */

/** 抖音发布风控类失败的关键词（命中即可引导用户走「解除发布风控」流程） */
const DOUYIN_RISK_MARKERS = ['创作者中心', '存在风险', '风控', '需要验证', '跳出验证', '安全验证', '单独发布', '单独发一']

/** 判断某条发布失败是否为「抖音发布风控/需验证」类（可走解除风控流程）。 */
export function isDouyinPublishRiskError(
  platformCode: string,
  errorMessage: string | null | undefined,
): boolean {
  if (platformCode !== 'DouYin') return false
  const msg = errorMessage ?? ''
  return DOUYIN_RISK_MARKERS.some((m) => msg.includes(m))
}

/** 登录态失效类失败关键词 */
const LOGIN_FAIL_MARKERS = ['登录失效', '登录态', '未登录', '账号未登录', '重新登录', '登录已过期']
/** 平台/账号侧上传/受理类失败关键词（账号无权限/被风控、素材或平台临时异常的典型表现） */
const PLATFORM_SIDE_MARKERS = [
  '上传失败', '获取视频上传参数失败', '获取上传', '获取视频大小失败',
  '视频下载失败', '转码', '取素材', '账号异常', '无权限', '权限不足', '风险', '受限',
]

/**
 * 发布失败的「可操作建议」文案：仅对识别得出的**平台/账号侧**失败给建议，
 * 内容类错误（如标题超长/缺字段）返回 null，由原始 errorMessage 自解释、不误导。
 * 抖音风控有专门的「解除发布风控」入口，这里不重复提示。
 */
export function getPublishFailureHint(
  platformCode: string,
  errorMessage: string | null | undefined,
): string | null {
  const msg = (errorMessage ?? '').trim()
  if (!msg) return null
  if (isDouyinPublishRiskError(platformCode, msg)) return null
  if (LOGIN_FAIL_MARKERS.some((m) => msg.includes(m))) {
    return '该账号登录态可能已失效：请到「账号管理」对该账号重新扫码授权后再重试。'
  }
  if (PLATFORM_SIDE_MARKERS.some((m) => msg.includes(m))) {
    return '多为平台或账号侧原因（账号无发布权限/被风控，或素材、平台临时异常）。可尝试：① 稍后重试；'
      + '② 登录该平台 App 手动发一条内容，确认该账号能否正常发布；③ 仍失败时在「账号管理」删除该账号、重新扫码登录后再试。'
  }
  return null
}
