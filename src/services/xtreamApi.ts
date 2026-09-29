export interface XtreamCredentials {
  serverAddress: string;
  username: string;
  password: string;
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id?: number | string;
}

export interface XtreamLiveStream {
  num?: number | string;
  name: string;
  stream_type?: string;
  stream_id: string;
  stream_icon?: string;
  epg_channel_id?: string;
  added?: string;
  category_id?: string;
}

interface XtreamUserInfo {
  auth?: number | string;
  status?: string;
  message?: string;
}

export interface XtreamAuthResponse {
  user_info?: XtreamUserInfo;
  server_info?: Record<string, unknown>;
}

const REQUEST_TIMEOUT_MS = 12000;

const normalizeServerAddress = (serverAddress: string) => {
  const trimmedServer = serverAddress.trim();

  if (!/^https?:\/\//i.test(trimmedServer)) {
    throw new Error('Server address must begin with http:// or https://.');
  }

  return trimmedServer
    .replace(/\/player_api\.php(?:\?.*)?$/i, '')
    .replace(/\/+$/, '');
};

const buildPlayerApiUrl = (
  credentials: XtreamCredentials,
  action?: string,
  extraParameters?: Record<string, string>,
) => {
  const baseUrl = normalizeServerAddress(credentials.serverAddress);

  const parameters = [
    `username=${encodeURIComponent(credentials.username)}`,
    `password=${encodeURIComponent(credentials.password)}`,
  ];

  if (action) {
    parameters.push(`action=${encodeURIComponent(action)}`);
  }

  if (extraParameters) {
    Object.entries(extraParameters).forEach(([key, value]) => {
      parameters.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      );
    });
  }

  return `${baseUrl}/player_api.php?${parameters.join('&')}`;
};

const requestJson = async <T>(url: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            'Connection timed out. Check the server address, port, and network connection.',
          ),
        );
      }, REQUEST_TIMEOUT_MS);
    });

    const response = await Promise.race([
      fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }),
      timeout,
    ]);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('The IPTV server rejected the credentials.');
      }

      if (response.status === 403) {
        throw new Error('Access to the IPTV server was denied.');
      }

      if (response.status === 404) {
        throw new Error(
          'The Xtream Player API could not be found on this server.',
        );
      }

      throw new Error(`The IPTV server returned HTTP ${response.status}.`);
    }

    const responseText = await response.text();

    try {
      return JSON.parse(responseText) as T;
    } catch {
      throw new Error('The IPTV server returned an invalid JSON response.');
    }
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const authenticateXtream = async (
  credentials: XtreamCredentials,
): Promise<XtreamAuthResponse> => {
  const url = buildPlayerApiUrl(credentials);

  const response = await requestJson<XtreamAuthResponse>(url);

  if (!response.user_info) {
    throw new Error(
      'The server response does not contain Xtream account information.',
    );
  }

  const authenticated =
    response.user_info.auth === 1 || response.user_info.auth === '1';

  if (!authenticated) {
    const providerStatus = response.user_info.status?.trim();

    const providerMessage = response.user_info.message?.trim();

    if (providerStatus && providerMessage) {
      throw new Error(
        `Authentication failed: ${providerStatus}. ${providerMessage}`,
      );
    }

    if (providerStatus) {
      throw new Error(`Authentication failed: ${providerStatus}.`);
    }

    throw new Error(
      providerMessage ||
        'Authentication failed. Check the username and password.',
    );
  }

  const accountStatus = response.user_info.status?.trim();

  if (accountStatus && accountStatus.toLowerCase() !== 'active') {
    throw new Error(`Account status is ${accountStatus}.`);
  }

  return response;
};

export const getLiveCategories = async (
  credentials: XtreamCredentials,
): Promise<XtreamCategory[]> => {
  const url = buildPlayerApiUrl(credentials, 'get_live_categories');

  const response = await requestJson<unknown>(url);

  if (!Array.isArray(response)) {
    throw new Error(
      'The IPTV server did not return a valid Live TV category list.',
    );
  }

  return response
    .filter(
      (category): category is XtreamCategory =>
        typeof category === 'object' &&
        category !== null &&
        'category_id' in category &&
        'category_name' in category,
    )
    .map((category) => ({
      ...category,
      category_id: String(category.category_id),
      category_name: String(category.category_name),
    }));
};

export const getLiveStreams = async (
  credentials: XtreamCredentials,
  categoryId: string,
): Promise<XtreamLiveStream[]> => {
  const url = buildPlayerApiUrl(credentials, 'get_live_streams', {
    category_id: categoryId,
  });

  const response = await requestJson<unknown>(url);

  if (!Array.isArray(response)) {
    throw new Error(
      'The IPTV server did not return a valid Live TV channel list.',
    );
  }

  return response
    .filter(
      (stream): stream is Record<string, unknown> =>
        typeof stream === 'object' &&
        stream !== null &&
        'stream_id' in stream &&
        'name' in stream,
    )
    .map((stream) => ({
      num:
        typeof stream.num === 'number' || typeof stream.num === 'string'
          ? stream.num
          : undefined,

      name: String(stream.name),

      stream_type:
        stream.stream_type !== undefined
          ? String(stream.stream_type)
          : undefined,

      stream_id: String(stream.stream_id),

      stream_icon: stream.stream_icon ? String(stream.stream_icon) : undefined,

      epg_channel_id: stream.epg_channel_id
        ? String(stream.epg_channel_id)
        : undefined,

      added: stream.added ? String(stream.added) : undefined,

      category_id:
        stream.category_id !== undefined
          ? String(stream.category_id)
          : undefined,
    }));
};

export const buildLiveStreamUrl = (
  credentials: XtreamCredentials,
  streamId: string,
): string => {
  const baseUrl = normalizeServerAddress(credentials.serverAddress);

  return (
    `${baseUrl}/live/` +
    `${encodeURIComponent(credentials.username)}/` +
    `${encodeURIComponent(credentials.password)}/` +
    `${encodeURIComponent(streamId)}.m3u8`
  );
};
