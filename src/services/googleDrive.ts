import { TaskItem, DailyLog } from '../types';

export const DRIVE_DATA_FILENAME = 'media-tracker-data.json';

export interface DriveSyncPayload {
  version: number;
  appName: string;
  updatedAt: string;
  tasks: TaskItem[];
  logs: DailyLog[];
}

export interface DriveFileInfo {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
}

/**
 * Searches for the app data file in Google Drive.
 * Scoped strictly to drive.file (files created or opened by this app).
 */
export async function findDriveFile(accessToken: string): Promise<DriveFileInfo | null> {
  const query = encodeURIComponent(`name = '${DRIVE_DATA_FILENAME}' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size)`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) {
      throw new Error('Google Drive 访问令牌已过期 (401)，请点击「快速续期凭证」恢复同步。');
    }
    if (res.status === 403 && (errText.includes('insufficient') || errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT'))) {
      throw new Error(
        'Google Drive 访问权限未生效 (403)。请点击弹窗右上方的「断开」然后重新登录，并在弹出的 Google 授权页中务必勾选「查看、编辑、创建和删除您使用此应用所用的特定 Google 云端硬盘文件」权限复选框。'
      );
    }
    throw new Error(`Google Drive API 查找文件失败 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }

  return null;
}

/**
 * Creates the initial tracker JSON file in Google Drive.
 */
export async function createDriveFile(
  accessToken: string,
  initialData: { tasks: TaskItem[]; logs: DailyLog[] }
): Promise<DriveFileInfo> {
  const metadata = {
    name: DRIVE_DATA_FILENAME,
    mimeType: 'application/json',
    description: '个人数字媒体与任务时序跟踪系统备份数据',
  };

  const payload: DriveSyncPayload = {
    version: 1,
    appName: '个人数字媒体与任务时序跟踪系统',
    updatedAt: new Date().toISOString(),
    tasks: initialData.tasks,
    logs: initialData.logs,
  };

  // Use multipart upload to create file with initial content
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(payload, null, 2) +
    closeDelimiter;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive API 创建文件失败 (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Reads and parses the data content of the file from Google Drive.
 */
export async function readDriveFileContent(
  accessToken: string,
  fileId: string
): Promise<DriveSyncPayload | null> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive API 读取数据失败 (${res.status}): ${errText}`);
  }

  try {
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('Failed to parse JSON from Google Drive:', err);
    return null;
  }
}

/**
 * Updates the existing file content in Google Drive.
 */
export async function updateDriveFileContent(
  accessToken: string,
  fileId: string,
  data: { tasks: TaskItem[]; logs: DailyLog[] }
): Promise<DriveFileInfo> {
  const payload: DriveSyncPayload = {
    version: 1,
    appName: '个人数字媒体与任务时序跟踪系统',
    updatedAt: new Date().toISOString(),
    tasks: data.tasks,
    logs: data.logs,
  };

  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,modifiedTime`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload, null, 2),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive API 更新数据失败 (${res.status}): ${errText}`);
  }

  return await res.json();
}
