export function isValidPassword(password: string): boolean {
  return password.length >= 6
}

export function required(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') {
    return '此字段为必填项'
  }
  return undefined
}

export function maxLength(max: number) {
  return (value: string): string | undefined => {
    if (value && value.length > max) {
      return `最多 ${max} 个字符`
    }
    return undefined
  }
}
