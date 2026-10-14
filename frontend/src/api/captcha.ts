import api from './index'

export type SliderData = {
  captchaId: string
  /** 背景图 dataURL */
  bg: string
  /** 拼图块 dataURL（宽 pieceSize、高 height，piece 绘制在 y 行） */
  puzzle: string
  y: number
  pieceSize: number
  width: number
  height: number
}

export const captchaApi = {
  /** 获取一道滑块拼图题 */
  getSlider: () => api.get<unknown, SliderData>('/captcha/slider'),
  /** 校验滑块位移，通过返回一次性 ticket */
  verify: (data: { captchaId: string; x: number }) =>
    api.post<unknown, { ticket: string }>('/captcha/verify', data),
}
