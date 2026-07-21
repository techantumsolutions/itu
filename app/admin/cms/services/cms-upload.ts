/** CMS upload helpers (presentation-adjacent service; no API side effects). */

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function handleCmsUpload(
  file: File | undefined,
  onDone: (url: string) => void,
): Promise<void> {
  if (!file) return
  const dataUrl = await fileToDataUrl(file)
  if (dataUrl) onDone(dataUrl)
}
