import api from './index'

export type UploadImageResult = {
  file_path: string
  /** MinIO profile/ 公开读 URL，浏览器可直接访问，无需鉴权 */
  url: string
}

export const uploadsApi = {
  uploadImage: (file: File): Promise<UploadImageResult> => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<unknown, UploadImageResult>('/uploads/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
