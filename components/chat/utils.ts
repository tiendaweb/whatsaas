export const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) { throw new Error('Failed to fetch'); }
  return res.json();
});

export const formatTimer = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const fileToBase64 = (blob: Blob, t?: (key: string) => string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const base64data = reader.result?.toString().split(',')[1];
      if (base64data) resolve(base64data);
      else reject(new Error(t ? t('error_base64') : "Could not convert file to base64"));
    };
    reader.onerror = (error) => reject(error);
  });
};

export function formatBytes(bytes: number | string | null, decimals = 2, t?: (key: string) => string) {
  if (bytes === null || bytes === undefined) return '';
  const bytesNum = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  
  const unit = t ? t('bytes') : 'Bytes';

  if (bytesNum === 0) return `0 ${unit}`;
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [unit, 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytesNum) / Math.log(k));
  
  return parseFloat((bytesNum / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export const isSameDay = (d1: Date, d2: Date) => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

export const formatDateSeparator = (date: Date, t?: (key: string) => string) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) {
    return t ? t('today') : 'Today';
  }
  if (target.getTime() === yesterday.getTime()) {
    return t ? t('yesterday') : 'Yesterday';
  }
  
  return target.toLocaleDateString();
};